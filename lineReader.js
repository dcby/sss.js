var fs = require("fs");

var createLineReader = function (file) {
	var bufSize = 8192;
	var buf = new Buffer(bufSize);
	var bytesRead = 1;
	var sval = "";
	var spos = 0;
	var npos = -1;
	var fd = fs.openSync(file, "r");

	var readLine = function () {
		if (sval == null)
			return null;

		while (npos == -1 && bytesRead > 0) {
			bytesRead = fs.readSync(fd, buf, 0, bufSize, null);
			sval = sval.substr(spos);
			spos = 0;
			sval += buf.toString("utf8", 0, bytesRead);
			npos = sval.indexOf("\n");
		}

		var ret;
		if (npos != -1) {
			var rfix = (npos > 0 && sval.charAt(npos - 1) == "\r") ? 1 : 0;
			ret = sval.substr(spos, npos - spos - rfix);
			spos = npos + 1;
			npos = sval.indexOf("\n", spos);
			return ret;
		}
		else {
			ret = sval.substr(spos);
			sval = null;
			return ret;
		}
	};

	var close = function () {
		fs.closeSync(fd);
	};

	return { readLine: readLine, close: close };
};

module.exports = createLineReader;
