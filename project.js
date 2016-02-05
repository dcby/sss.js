var fs = require("fs"),
	yaml = require("js-yaml"),
	lib = require("./lib");

var project = module.exports = {};

var expectedKeys = ["v", "ex", "db", "transport", "throttle", "tracking", "helo", "from", "to", "message", "defines"];

project.load = function (file) {
	var m;
	var data = fs.readFileSync(file, "utf8");

	// pre-process
	// heredocs
	data = data.replace(/^( *)([_a-zA-Z\-][_a-zA-Z0-9:\-]*?) <<(\w+)(\+|-)?([^]+?)\r?\n\3/gm, function (match, p1, p2, p3, p4, p5) {
		p5 = p5.replace(/\n/g, "\n" + p1 + "  ");
		return p1 + p2 + " |" + (p4 || "") + p5;
	});

	var ret = yaml.load(data);

	// guard against unknown keys
	Object.keys(ret).forEach(function (k) {
		if (expectedKeys.indexOf(k) < 0)
			throw new Error("Invalid key: '" + k + "'");
	});

	// post-process
	// convert eol for all strings to crlf to comform rfc
	fixEol(ret);

	// ex
	// explicitly define
	ret.ex = ret.ex || [];
	// convert single ex into array with one element
	if (ret.ex.constructor === String)
		ret.ex = [ret.ex];

	// db
	if (!ret.db)
		throw new Error("db is required");

	// throttle
	if ("throttle" in ret)
		ret.throttle = lib.parseTimespan(ret.throttle);
	else
		ret.throttle = 1000; // 1s

	// message
	if (!ret.message)
		throw new Error("message is required");
	// split message into headers and body
	ret.headers = ret.message.split(/\r\n\r\n([^]*)/);
	ret.body = ret.headers[1];
	ret.headers = ret.headers[0];
	delete ret.message;

	// process headers and remove any lines started with #
	ret.headers = ret.headers.split("\r\n").filter(function (v) {
		return v.charAt(0) !== "#";
	}).join("\r\n");

	// variables
	ret.defines = ret.defines || {};
	ret.defines.lib = ret.defines.lib || {}; // user functions

	// from
	if (!ret.from) {
		if (m = ret.headers.match(/^from:.+?<(.+?)>$/im))
			ret.from = m[1];
	}
	if (!ret.from)
		throw new Error("from is required");

	// to
	if (!ret.to) {
		if (m = ret.headers.match(/^to:.+?<(.+?)>$/im))
			ret.to = m[1];
	}
	if (!ret.to)
		throw new Error("to is required");

	// content-transfer-encoding
	ret.contentTransferEncoding = "7bit";
	if (m = ret.headers.match(/^content-transfer-encoding:\s+(.+?)$/im))
		ret.contentTransferEncoding = (m[1] || ret.contentTransferEncoding).toLowerCase();


	return ret;
};

function fixEol(obj) {
	var n, v;
	for (n in obj) {
		v = obj[n];
		if (!v)
			continue;
		if (v.constructor === String)
			obj[n] = v.replace(/\r?\n/g, "\r\n");
		else if (v.constructor === Array || v.constructor === Object)
			fixEol(v);
	}
}