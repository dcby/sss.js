var fs = require("fs"),
	yaml = require("js-yaml");

var data = fs.readFileSync("D:/!w/!M/sss.js/!data/yaml.sssp", "utf8");

data = data.replace(/:\s<<(\w+)([^]+?)\r?\n\1/g, function(match, p1, p2) {
	p2 = p2.replace(/\n/g, "\n ");
	return ": |" + p2;
});

var doc = yaml.safeLoad(data);

console.log(doc.message);