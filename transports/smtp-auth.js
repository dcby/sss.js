var funcs = require("./smtp-auth-funcs");

function Smtpauth(sock, opts) {
	var _x = sock.x,
		_self = this,
		_func, // selected auth mechanism func
		_seq = 0; // auth sequence number
	_x.auth = _self;

	function _start(mechanisms) {
		// handshake
		var map = {}, r;
		mechanisms.forEach(function (v) {
			map[v] = funcs[v];
		});
		_func = map["cram-md5"] || map["digest-md5"] || map.plain || map.login;
		// todo: favour clear text mechanisms in case of TLS/SSL

		if (_func) {
			r = _func(opts, _seq++);
			_send(r);
			return true;
		}

		return false;
	}

	function _update(reply) {
		// return values: true = success, false = fail, undefined = not complete
		switch (reply.code) {
			case 235: // success
				return true;
			case 334: // not complete; client input required
				break;
			default: // complete and not success = failed
				return false;
		}

		// calc response using desired auth scheme method
		var r = _func(opts, _seq++, reply);
		_send(r);
	}

	function _send(r) {
		if (r === undefined) // if no answer (empty string is a valid answer) then abort auth
			r = "*";
		r += "\r\n";
		sock.write(r);
		_x.cmd.push("auth");
	}

	_self._start = _start;
	_self._update = _update;
}

Smtpauth.prototype.start = function (mechanisms) { return this._start(mechanisms); };
Smtpauth.prototype.update = function (reply) { return this._update(reply); };

exports.Smtpauth = Smtpauth;
