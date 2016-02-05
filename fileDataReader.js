var util = require("util"),
	lib = require("./lib"),
	lineReader = require("./lineReader");

var createDataReader = function (db) {
	var lr = lineReader(db);
	var fields, values, row = 0,
		map, // field to index map
		lcmap, // lower-case map
		ccrevmap, // reverse camel-case map
		v;

	// read first line
	var line = lr.readLine();

	var bogus = function () {}; // helper template to guard native function members against camel-case assignment

	if (line) {
		fields = line.split(";");
		map = {};
		lcmap = {};
		ccrevmap = [];
		for (var i = 0; i < fields.length; i++) {
			map[fields[i]] = i;
			lcmap[fields[i].toLowerCase()] = i;
			v = lib.toCamelCase(fields[i]);
			if (v in bogus)
				throw Error(util.format("database must not have camelCased field '%s'", v));
			ccrevmap[i] = v;
		}
	}

	var read = function () {
		if (line == null)
			return;
		line = lr.readLine();
		row++;
		if (line == null)
			return;

		values = line.split(";");

		var ret = function (f) {
			if (f.constructor === String)
				return values[lcmap[f.toLowerCase()]];
			return values[f];
		};

		for (var i = 0; i < values.length; i++)
			ret[ccrevmap[i]] = values[i];

		ret.values = values;

		return ret;
	};

	var close = function () {
		lr.close();
	};

	var ret = { read: read, close: close, fields: fields };
	ret.__defineGetter__("src", function () {
		return db;
	});
	ret.__defineGetter__("row", function () {
		return row;
	});

	return ret;
};

module.exports = createDataReader;
