"use strict";

var os = require("os"),
	fs = require("fs"),
	path = require("path"),
	crypto = require("crypto"),
	dot = require("dot"),
	lib = require("./lib"),
	lineReader = require("./lineReader"),
	dataReader = require("./fileDataReader"),
	project = require("./project"),
	smtp = require("./transports/smtp");

// shortcuts
var lo = console.log,
	wa = console.warn,
	er = console.error,
	fmt = require("util").format;

function sss(file, opts) {
	var _ctx = { opstack: [] };

	function makeContext() {
		var prj, v;

		// statistics
		_ctx.stat = {
			startDate: new Date(),
			sent: 0,
			//errors: 0, // total errors count
			cascadeErrors: 0 // consecutive errors count
		};

		// convert file path to absolute
		if (!path.isAbsolute(file))
			file = path.normalize(path.join(process.cwd(), file));

		// users input
		_ctx.input = {
			file: file,
			opts: opts,
			prj: project.load(file)
		};
		prj = _ctx.input.prj;
		_ctx.dir = path.dirname(_ctx.input.file);

		// override prj
		prj.to = opts.to || prj.to;

		// exclusions
		_ctx.ex = { src: [], domains: [], emails: [] };

		if (prj.ex.length && !opts.test) {
			lo("preparing exclusions");
			for (var i = 0; i < prj.ex.length; i++) {
				v = prj.ex[i];
				// convert to absolute if relative
				if (!path.isAbsolute(v))
					v = path.normalize(path.join(_ctx.dir, v));
				// add to list
				_ctx.ex.src.push(v);
			}
			makeEx();
		}

		// database
		v = prj.db;
		if (!path.isAbsolute(v))
			v = path.normalize(path.join(_ctx.dir, v));
		_ctx.dbr = dataReader(v);

		// persistent state
		_ctx.state = {
			lastFile: _ctx.input.file + ".last",
			lastDate: new Date(2000, 0)
		};

		// start, count, end, record number, sent count
		if (!opts.start || opts.start === "a") {
			try {
				var data = fs.readFileSync(_ctx.state.lastFile, { encoding: "ascii" });
				data = data.trim();
				_ctx.start = parseInt(data) + 1;
			}
			catch (e) {
			}
			_ctx.start = _ctx.start || 1;
		}
		else
			_ctx.start = +opts.start;

		_ctx.cnt = opts.count || (opts.test ? 1 : Infinity);
		_ctx.end = opts.end || Infinity;

		dot.templateSettings.strip = false;
		dot.templateSettings.varname = "sys, db, def";
		_ctx.template = {
			helo: dot.template((prj.helo || "").trim(), null, prj.defines),
			from: dot.template(prj.from, null, prj.defines),
			to: dot.template(prj.to, null, prj.defines),
			headers: dot.template(prj.headers, null, prj.defines),
			body: dot.template(prj.body, null, prj.defines)
		};

		// sys functions and variables available in template
		_ctx.sys = {
			fn: {
				to2822: lib.dateTo2822,
				toId: lib.dateToId,
				bytes: crypto.pseudoRandomBytes,
				int: lib.randomInteger
			}
		};

		// project variables
		// arrays
		prj.arrays = lib.findArrays(prj.defines);

		// transport
		if (prj.transport.type === "smtp") {
			_ctx.transport = new smtp.SmtpTransport(prj.transport)
				.on("sent", onsent)
				.on("error", onerror);
		}
		else
			throw new Error(fmt("Unsupported transport type '%s'.", prj.transport.type));

		// tracking
		if (prj.tracking && !opts.test) {
			if (prj.tracking.constructor === String)
				_ctx.tracking = { uri: prj.tracking };
			else
				_ctx.tracking = prj.tracking;
			_ctx.tracking.every = _ctx.tracking.every || 100;
			_ctx.tracking.tracker = new (require("./tracker").Tracker)({
				uri: _ctx.tracking.uri,
				project: _ctx.input.file,
				db: { db: _ctx.dbr.src }
			});
		}

		_ctx.opstack.push("context");
	}

	function makeEx() {
		var domains = [], emails = [];

		for (var i = 0; i < _ctx.ex.src.length; i++) {
			var lr = lineReader(_ctx.ex.src[i]);
			var line;
			while ((line = lr.readLine()) != null) {
				line = line.toLowerCase();
				var match, arr;
				if (match = line.match(/\*([a-zA-Z0-9\-\.]+)/))
					arr = domains;
				else if (match = line.match(/([^@\s]+@[a-zA-Z0-9\-\.]+)/))
					arr = emails;
				if (match)
					arr.push(match[1]);
			}
			lr.close();
		}

		// sort and dedupe
		_ctx.ex.domains = domains.sort().filter(function (e, i) {
			return !i || e !== domains[i - 1];
		});
		_ctx.ex.emails = emails.sort().filter(function (e, i) {
			return !i || e !== emails[i - 1];
		});
	}

	function checkEx(email) {
		if (lib.binarySearch(_ctx.ex.emails, email) != -1)
			return true;

		var domain = email.substr(email.lastIndexOf("@") + 1);
		return lib.binarySearch(_ctx.ex.domains, domain) != -1;
	}

	function processMsg() {
		if (_ctx.cleanup)
			return;

		var prj = _ctx.input.prj,
			sys = _ctx.sys,
			now,
			encFunc;

		var to = _ctx.template.to(sys, _ctx.dr, prj.defines).toLowerCase();
		if (checkEx(to)) {
			wa("address excluded: %s", to);
			setImmediate(next);
			return;
		}

		// throttling
		if (prj.throttle) {
			var millis = _ctx.state.lastDate - new Date() + prj.throttle;

			if (millis > 0) {
				_ctx.pause = setTimeout(processMsg, millis);
				return;
			}
		}

		now = new Date();
		_ctx.state.lastDate = now;

		// date
		sys.date = now;
		sys.date2822 = lib.dateTo2822(sys.date);

		// rotate arrays
		prj.arrays.forEach(function (v) {
			if (v.roundRobinIndex === undefined || v.roundRobinIndex === v.length)
				v.roundRobinIndex = 0;
			v.roundRobin = v[v.roundRobinIndex++];
			v.random = v[lib.getRandomInt(0, v.length)];
		});

		sys.msg = {
			to: to
		};

		switch (prj.contentTransferEncoding) {
			case "quoted-printable":
				encFunc = lib.encodeQuotedPrintable;
				break;
			default:
				encFunc = lib.encodeFlowed;
				break;
		}

		_ctx.msg = {
			rn: _ctx.dbr.row, // row number to track
			helo: _ctx.template.helo(sys, _ctx.dr, prj.defines) || os.hostname(),
			from: _ctx.template.from(sys, _ctx.dr, prj.defines).toLowerCase(),
			to: to,
			headers: _ctx.template.headers(sys, _ctx.dr, prj.defines),
			body: encFunc(_ctx.template.body(sys, _ctx.dr, prj.defines), 70)
		};

		_ctx.transport.send(_ctx.msg);
	}

	function storeState(state, callback) {
		if (!_ctx.state.last)
			fs.open(_ctx.state.lastFile, "w", function (err, fd) {
				if (err)
					callback(err);
				else {
					_ctx.state.last = fd;
					storeState(state, callback);
				}
			});
		else {
			var buf = new Buffer(state.toString());
			fs.write(_ctx.state.last, buf, 0, buf.length, 0, callback);
		}
	}

	// transport events
	function onsent() {
		_ctx.stat.cascadeErrors = 0; // reset consecutive errors
		_ctx.stat.sent++;

		if (opts.test) {
			next();
			return;
		}

		storeState(_ctx.dbr.row, function (err) {
			if (err) {
				cancel();
				er(err.stack);
				throw new Error(fmt("Unable to store state: %d", _ctx.dbr.row));
			}
			next();
		});
	}

	var _argDependentSmtpCommands = ["mailfrom", "rcptto", "data"]; // commands that depends on arguments

	function onerror(err, msg) {
		var text = err.toString(),
			callback;
		// if we got an SmtpError during a transaction then prepare detailed info
		if (err instanceof smtp.SmtpError && _argDependentSmtpCommands.indexOf(err.command) > -1) {
			text = fmt("%s; from: <%s>; to: <%s>; @%s:%d", text, msg.from, msg.to, _ctx.dbr.src, msg.rn);
			callback = next; // will move to next record
		}
		else
			callback = processMsg; // will retry current record

		wa(text);
		// throw if too many consecutive errors
		if (++_ctx.stat.cascadeErrors >= 10)
			throw new Error("Too many transport errors.");
		callback();
	}

	function next() {
		if (_ctx.cleanup)
			return;

		if (_ctx.dbr.row + 1 <= _ctx.end && _ctx.stat.sent < _ctx.cnt && (_ctx.dr = _ctx.dbr.read())) {
			if (_ctx.tracking && _ctx.dbr.row % _ctx.tracking.every === 0)
				track({ type: "run", record: _ctx.dbr.row }, processMsg);
			else
				processMsg();
		}
		else {
			// we are done
			// probe next record to determine if more records to go
			_ctx.dr = _ctx.dbr.read();
			track({ type: "end", record: _ctx.dbr.row - 1, isLastRecord: !_ctx.dr }, end);
		}
	}

	function track(opts, next) {
		var data;
		if (_ctx.tracking) {
			_ctx.tracking.tracker.track(opts, function (err) {
				if (err) {
					data = err.stack;
					if (err.data)
						data += os.EOL + "data: " + err.data;
					wa(data);
				}
				if (next) next();
			});
		}
		else if (next) next();
	}

	function send() {
		// prepare context
		makeContext();

		if (_ctx.start > 1)
			lo("sync start record: %d", _ctx.start);
		while (_ctx.dbr.row + 1 < _ctx.start && _ctx.dbr.read())
			;
		_ctx.opstack.push("recsync");

		lo("send start: %s", _ctx.input.file);
		track({ type: "start", record: _ctx.start }, next);
		_ctx.opstack.push("start");
	}

	function end(coarse) {
		var op;
		_ctx.cleanup = true;
		clearTimeout(_ctx.pause);
		delete _ctx.pause;
		while (op = _ctx.opstack.pop()) {
			switch (op) {
				case "start":
					lo("stat; sent: %d; time: %s", _ctx.stat.sent, lib.toTimespan(new Date() - _ctx.stat.startDate));
					lo("send %s: %s", coarse ? "interrupt" : "complete", _ctx.input.file);
					break;
			}
		}
		if (_ctx.transport)
			_ctx.transport.close(coarse);
		if (_ctx.dbr)
			_ctx.dbr.close();
		if (_ctx.state.last)
			fs.closeSync(_ctx.state.last);
	}

	function cancel() {
		_ctx.cancel = true;
		track({ type: "int", record: _ctx.dbr.row });
		end(true);
	}

	return {
		send: send,
		cancel: cancel
	};
}

module.exports = sss;
