var util = require("util"),
	net = require("net"),
	EventEmitter = require("events").EventEmitter,
	Smtpauth = require("./smtp-auth").Smtpauth;

var fmt = util.format;

function SmtpTransport(opts) {
	opts = opts || {};
	opts.recvto = opts.recvto || 5000;
	var _self = this,
		_sock; // socket

	var _socketEvents = {
		data: _ondata,
		timeout: _ontimeout,
		error: _onerror,
		close: _onclose
	};

	function _send(msg) {
		if (!msg)
			throw new ReferenceError("Argument 'msg' is undefined or null.");

		var x = _sock ? _sock.x : { trans: 0, errors: [] };
		x.msg = msg; // attach message

		if (_sock && x.trans % 100 == 0)
			_disconnect(_sock);

		if (!_sock)
			_connect(x);
		else
			_sendEnvelope(_sock);
	}

	function _close(coarse) {
		if (_sock)
			_disconnect(_sock, coarse);
	}

	function _connect(x) {
		if (x.errors.length > 2) {
			_self.emit("error", x.errors[x.errors.length - 1]);
			return;
		}

		_sock = net.connect({ host: opts.server || "127.0.0.1", port: opts.port || 25, localAddress: opts.localAddress });
		x.cmd = [];
		x.cmd.push(null); // connect pseudo-command
		_sock.setTimeout(opts.recvto);
		_configureSocket(_sock, x);
	}

	function _disconnect(sock, coarse) {
		_sock = undefined;
		_unconfigureSocket(sock);
		sock.on("error", function () {});
		if (coarse)
			sock.destroy();
		else {
			sock.write("QUIT\r\n");
			sock.setTimeout(5000, function () {
				this.destroy(); // destroy if not closed within 5s
			});
		}
	}

	function _sendHelo(sock) {
		var x = sock.x;
		sock.write("EHLO " + x.msg.helo + "\r\n");
		x.cmd.push("helo");
	}

	function _sendEnvelope(sock) {
		var x = sock.x;
		var raw = [
			"RSET",
			"MAIL FROM:<" + x.msg.from + ">",
			"RCPT TO:<" + x.msg.to + ">",
			"DATA",
			""
		].join("\r\n");

		sock.setTimeout(opts.recvto);
		sock.write(raw);
		x.cmd.push("rset", "mailfrom", "rcptto", "data");
		x.trans++; // increment transactions count
	}

	function _sendData(sock) {
		var x = sock.x;
		var raw = [
			x.msg.headers,
			"",
			x.msg.body,
			".",
			""
		].join("\r\n");

		sock.write(raw);
		x.cmd.push(".");
	}

	function _configureSocket(sock, x) {
		sock.setEncoding("ascii");
		Object.keys(_socketEvents).forEach(function (v) {
			sock.on(v, _socketEvents[v]);
		});
		sock.x = x;
	}

	function _unconfigureSocket(sock) {
		Object.keys(_socketEvents).forEach(function (v) {
			sock.removeListener(v, _socketEvents[v]);
		});
	}

	function _ondata(raw) {
		var sock = this,
			x = sock.x;

		if (!x.cmd.length) {
			// something wrong! we receiving data on a socket while no data is expected
			_disconnect(sock);
			return;
		}

		if (x.raw)
			raw = x.raw + raw;
		var line, match;
		var lines = raw.split(/\r?\n/);
		x.raw = lines.pop(); // pop very last line. may be empty (previous line is complete) or not (this line is incomplete)

		// process complete lines
		for (var i = 0; i < lines.length; i++) {
			line = lines[i];
			x.reply = x.reply || { lines: [] };
			if (match = line.match(/^(\d\d\d)([\- ]|$)(.*)/)) {
				if (match[2] === " " || !match[2]) // "DDD" or "DDD " or "DDD Text..."
					x.reply.code = parseInt(match[1]);
				x.reply.lines.push(match[3]);
			}
			else {
				// unable to parse reply
				_disconnect(sock, true);
				process.nextTick(function () {
					_self.emit("error", new SmtpError("Invalid reply", undefined, x.cmd.shift() || undefined));
				});
				return;
			}

			if ("code" in x.reply)
				_processReply(sock);
		}
	}

	function _ontimeout() {
		var sock = this,
			x = sock.x;
		var e = new Error("Socket timeout.");
		x.errors.push(e);
		_disconnect(sock, true);
		if (x.msg) // retry if message is attached
			_connect(x);
	}

	function _onerror(e) {
		var sock = this,
			x = sock.x;
		x.errors.push(e);
		_disconnect(sock, true);
		if (x.msg) // retry if message is attached
			_connect(x);
	}

	function _onclose() {
		// we will hit this event only if socket was closed unexpectedly
		var sock = this,
			x = sock.x;
		var e = new Error("Connection terminated unexpectedly.");
		x.errors.push(e);
		_connect(x);
	}

	function _processReply(sock) {
		var x = sock.x,
			cmd = x.cmd.shift(),
			reply = x.reply,
			err, msg, v;
		delete x.reply;

		switch (cmd) {
			case null: // connect pseudo-command
				if (reply.code === 220) {
					_sendHelo(sock);
					return;
				}
				x.err = new SmtpError(fmt("%d %s", reply.code, reply.lines.join(" ")), reply.code);
				break;
			case "helo":
				if (reply.code !== 250)
					break;
				if (opts.auth) {
					new Smtpauth(sock, opts.auth); // this will create auth engine and attach it to x as 'auth'
					// get mechanisms supported by server
					v = extractMechanisms(reply.lines);
					// try to send initial auth client-response; may fail if no mechanisms supported by server found
					if (x.auth.start(v || []))
						return;
				}

				// if helo succeed and no auth is required (or auth not possible) then proceed with message envelope
				_sendEnvelope(sock);
				return;
			case "auth":
				// get auth status and send farther client-response (if required)
				v = x.auth.update(reply); // true = success, false = fail, undefined = not complete
				if (v)
					_sendEnvelope(sock);
				if (v || v === undefined)
					return;
				// v == false
				x.err = new SmtpError(fmt("%d %s", reply.code, reply.lines.join(" ")), reply.code, cmd);
				break;
			case "rset":
			case "mailfrom":
			case "rcptto":
				// because we are pipelining we must capture very first error or skip if error already captured
				if (reply.code !== 250 && !x.err)
					x.err = new SmtpError(fmt("%d %s", reply.code, reply.lines.join(" ")), reply.code, cmd);
				return; // we need to drain any pending (pipelined) replies even in case of error, so return
			case "data":
				if (x.err) // we have captured error from previous pipelining commands. report it
					break;
				if (reply.code === 354) {
					_sendData(sock);
					return;
				}
				x.err = new SmtpError(fmt("%d %s", reply.code, reply.lines.join(" ")), reply.code, cmd);
				break;
			case ".":
				if (reply.code !== 250)
					x.err = new SmtpError(fmt("%d %s", reply.code, reply.lines.join(" ")), reply.code, cmd);
				break;
		}

		// if we hit here then either message was successfully processed or error has occured
		err = x.err;
		msg = x.msg;
		delete x.msg; // detach message to not send it again accidentally
		delete x.raw; // delete any partial replies
		delete x.err; // remove captured error
		x.errors = []; // reset errors
		sock.setTimeout(0); // nothing to receive, so disable the timeout
		process.nextTick(function () {
			if (err)
				_self.emit("error", err, msg);
			else
				_self.emit("sent", msg);
		});
	}

	EventEmitter.call(this);

	_self._send = _send;
	_self._close = _close;
}

util.inherits(SmtpTransport, EventEmitter);
SmtpTransport.prototype.send = function (msg) { this._send(msg); };
SmtpTransport.prototype.close = function (coarse) { this._close(coarse); };

exports.SmtpTransport = SmtpTransport;

function SmtpError(message, replyCode, command) {
	this.name = this.constructor.name;
	this.message = message;
	this.command = command;
	Error.call(this, this.message);
	Error.captureStackTrace(this, arguments.callee);
}

util.inherits(SmtpError, Error);
exports.SmtpError = SmtpError;

function extractMechanisms(lines) {
	var i, v;
	for (i = 0; i < lines.length; i++) {
		v = lines[i].toLowerCase();
		if (v.indexOf("auth ") === 0) {
			v = v.substr(5).split(/ +/g);
			return v;
		}
	}
}
