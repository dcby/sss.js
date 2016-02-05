var util = require("util"),
	libmime = require("libmime"),
	libqp = require("libqp"),
	lib = module.exports;

lib.binarySearch = function binarySearch(arr, val) {
	var lo = 0, hi = arr.length - 1, mid;
	while (lo <= hi) {
		mid = Math.floor((lo + hi) / 2);
		if (arr[mid] > val)
			hi = mid - 1;
		else if (arr[mid] < val)
			lo = mid + 1;
		else
			return mid;
	}
	return -1;
};

var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

lib.dateTo2822 = function (date) {
	// Thu, 05 Feb 2015 18:14:33 +0300
	var v, w;
	var ret = weekdays[date.getDay()] + ", ";
	ret += ((v = date.getDate()) > 9 ? v : "0" + v) + " ";
	ret += months[date.getMonth()] + " " + date.getFullYear() + " ";
	ret += ((v = date.getHours()) > 9 ? v : "0" + v) + ":";
	ret += ((v = date.getMinutes()) > 9 ? v : "0" + v) + ":";
	ret += ((v = date.getSeconds()) > 9 ? v : "0" + v) + " ";
	ret += (v = date.getTimezoneOffset()) >= 0 ? "-" : "+";
	v = Math.abs(v);
	ret += (w = Math.floor(v / 60)) > 9 ? w : "0" + w;
	ret += (w = v % 60) > 9 ? w : "0" + w;

	return ret;
};

lib.dateToId = function (date) {
	// 20150327105117.5f2d1e6d1b@7d2d
	// 20150402173601.C8AEE20D42C1@mail.test.com
	var v;
	return ""
		+ date.getUTCFullYear()
		+ ((v = date.getUTCMonth() + 1) > 9 ? v : "0" + v)
		+ ((v = date.getUTCDate()) > 9 ? v : "0" + v)
		+ ((v = date.getUTCHours()) > 9 ? v : "0" + v)
		+ ((v = date.getUTCMinutes()) > 9 ? v : "0" + v)
		+ ((v = date.getUTCSeconds()) > 9 ? v : "0" + v);
};

var ccre = {
	trimStart: /^[^a-zA-Z]+/,
	trimEnd: /[^a-zA-Z0-9]+$/,
	mid: /[^a-zA-Z0-9]+(.)/g
};

lib.toCamelCase = function (name) {
	name = name
		.toLowerCase()
		.replace(ccre.trimStart, "")
		.replace(ccre.trimEnd, "")
		.replace(ccre.mid, function (m, p1) {
			return p1.toUpperCase();
		});

	return name;
};

var tsre = /(\d+)(ms|[dhms]|$)/g;

lib.parseTimespan = function (timespan) {
	timespan = "" + timespan; // convert to string

	var ret = 0, v, m;
	while (m = tsre.exec(timespan)) {
		v = parseInt(m[1]);
		switch (m[2]) {
			case "d": // days
				ret += v * 86400000;
				break;
			case "h": // hours
				ret += v * 3600000;
				break;
			case "m": // minutes
				ret += v * 60000;
				break;
			case "s": // seconds
				ret += v * 1000;
				break;
			default: // milliseconds
				ret += v;
				break;
		}
	}

	return ret;
};

lib.toTimespan = function (millis) {
	millis = +millis; // convert to number
	if (!millis)
		return "0ms";

	var ret = "",
		v;

	v = Math.floor(millis / 86400000); // days
	millis %= 86400000;
	if (v)
		ret += v + "d";

	v = Math.floor(millis / 3600000); // hours
	millis %= 3600000;
	if (v || ret && millis)
		ret += v + "h";

	v = Math.floor(millis / 60000); // minutes
	millis %= 60000;
	if (v || ret && millis)
		ret += v + "m";

	v = Math.floor(millis / 1000); // seconds
	millis %= 1000;
	if (v || ret && millis)
		ret += v + "s";

	if (millis)
		ret += millis + "ms";

	return ret;
};

lib.getRandomInt = function (min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
};

lib.findArrays = function findArrays(obj) {
	var arrs = arguments[1] || [];

	var n, v;
	for (n in obj) {
		v = obj[n];
		if (!v)
			continue;
		if (v.constructor === Array)
			arrs.push(v);
		if (v.constructor === Array || v.constructor === Object)
			findArrays(v, arrs);
	}

	return arrs;
};

// fixed version of libmime.encodeFlowed
// changes:
// replace(/^( |From|>)/igm, ' $1'), => replace(/^( |From |>)/igm, ' $1'),
lib.encodeFlowed = function (str, lineLength) {
	lineLength = lineLength || 76;

	var flowed = [];
	str.split(/\r?\n/).forEach(function (line) {
		flowed.push(libmime.foldLines(line.
				// space stuffing http://tools.ietf.org/html/rfc3676#section-4.2
				replace(/^( |From |>)/igm, ' $1'),
			lineLength, true));
	});
	return flowed.join('\r\n');
};

lib.encodeQuotedPrintable = function (str, lineLength) {
	lineLength = lineLength || 76;
	str = libqp.encode(str);
	str = libqp.wrap(str, lineLength);
	return str;
};

lib.randomInteger = function (min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
};
