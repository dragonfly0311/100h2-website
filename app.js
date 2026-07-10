const server_port = process.env.PORT || 3000;
const db_path = process.env.MONGO_URI

const express = require('express');
const cors = require('cors');
const path = require('path');
const monk = require('monk');
const multer = require('multer');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const db = monk(db_path);

const storage = multer.diskStorage({
	destination: function(req, file, cb){
		cb(null, "uploads/"); 
	}, 
	filename: function(req, file, cb){
		const ext = file.mimetype.split('/')[1]; 
		cb(null, file.originalname.slice(0, -ext.length -1) + '-' + Date.now() + "." + ext); 
	}
})
const upload = multer({ storage: storage });

function loopfun(keys, arr) {
	let string = "";
	keys.forEach(key => {
		string += `"${key}":"${arr[key]}",`;
	})
	string = string.slice(0, -1);
	return string;
}
function loopfun_array(keys, arr) {
	let string = "";
	arr.forEach(item => {
		string += `{${loopfun(keys, item)}},`;
	})
	string = string.slice(0, -1);
	return string;
}
function getTime() {
	const obj = new Date();
	const second = ("0" + obj.getSeconds()).slice(-2);
	const minute = ("0" + obj.getMinutes()).slice(-2);
	const hour = ("0" + obj.getHours()).slice(-2);
	const day = ("0" + obj.getDate()).slice(-2);
	const month = ("0" + (obj.getMonth() + 1)).slice(-2);
	const year = obj.getFullYear();
	return `${hour}:${minute}, ${day}/${month}/${year}`
}

let common = {};
const common_col = db.get('common');
common_col.aggregate([
	{
		$group: {
			_id: "$element_name",
			data: {$push: "$$ROOT"}
		}
	}
]).then((docs) => {
	let json = "";
	docs.forEach(doc => {
		const keys = Object.keys(doc.data[0]);
		keys.splice(keys.indexOf("element_name"), 1);
		const obj = `"${doc.data[0].element_name}": [${loopfun_array(keys, doc.data)}],`
		json += obj;
	})
	json = json.slice(0, -1);
	common = JSON.parse(`{${json}}`);
});

app.use((req, res, next) => {
	req.db = db;
	req.common = common;
	req.loopfun = loopfun;
	req.loopfun_array = loopfun_array;
	req.getTime = getTime;
	next();
});

// Contact form submit
app.post('/api/contact', (req, res) => {
	const db = req.db;
	const contact_col = db.get('Contact');
	const timestamp = req.getTime();
	const { name, email, phone, requirement, contact_type } = req.body;
	const submitData = {
		timestamp,
		name,
		email,
		phone,
		requirement,
		contact_type
	};
	contact_col.insert(submitData).then(() => {
		const result = { confirm: true, message: "Submit success" }
		const finalData = Object.assign(result, req.common);
		res.json(finalData);
	}).catch(err => {
		const result = { confirm: false, message: "Submit failed" }
		const finalData = Object.assign(result, req.common);
		res.json(finalData);
	})
})

// Get all contact messages + dropdown options (FIXED SORT SYNTAX)
app.get('/api/contact', (req, res) => {
	const db = req.db;
	const contact_col = db.get('Contact');
	const option_col = db.get('contact_option');
	Promise.all([
		contact_col.find({}, { sort: { _id: -1 } }),
		option_col.find()
	]).then(([contact_list, option_list]) => {
		const returnJson = { contact_list, option_list };
		const final = Object.assign(returnJson, req.common);
		res.json(final);
	})
})

// Get latest news (FIXED SORT SYNTAX)
app.get('/api/news', (req, res) => {
	const db = req.db;
	const news_col = db.get('News');
	news_col.find({}, { sort: { updateTime: -1 }, limit: 1 }).then(docs => {
		const returnJson = { news: docs[0] || {} };
		const final = Object.assign(returnJson, req.common);
		res.json(final);
	})
})

// Save / update news
app.post('/api/news/save', (req, res) => {
	const db = req.db;
	const news_col = db.get('News');
	const timestamp = req.getTime();
	const { content } = req.body;
	const newsData = {
		updateTime: timestamp,
		content: content
	};
	news_col.remove({}).then(() => {
		return news_col.insert(newsData);
	}).then(() => {
		const result = { confirm: true, message: "News updated successfully" }
		const final = Object.assign(result, req.common);
		res.json(final);
	}).catch(() => {
		const result = { confirm: false, message: "Update failed" }
		const final = Object.assign(result, req.common);
		res.json(final);
	})
})

// Fallback route for root
app.get('*', (req, res) => {
	res.json(req.common);
})

app.listen(server_port, () => {
	console.log("100H2 Server running on port " + server_port);
})

// Clear all contact messages
app.delete("/api/clear-all-contact", async (req, res) => {
  try {
    await Contact.deleteMany({});
    res.json({ success: true, msg: "All contact messages cleared" });
  } catch (err) {
    res.json({ success: false, msg: "Clear failed" });
  }
});