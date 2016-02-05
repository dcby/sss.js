var crypto = require("crypto");

function am_plain(opts) {
	var v;
	v = "\x00" + opts.username + "\x00" + opts.password;
	v = new Buffer(v, "utf8").toString("base64");
	v = "AUTH PLAIN " + v;
	return v;
}

function am_login(opts, round) {
	var v;

	switch (round) {
		case 0:
			return "AUTH LOGIN";
		case 1:
			v = opts.username;
		case 2:
			v = new Buffer(v || opts.password, "utf8").toString("base64");
			return v;
	}
}

function am_crammd5(opts, round, reply) {
	var v, hmac;

	switch (round) {
		case 0:
			return "AUTH CRAM-MD5";
		case 1:
			if (!reply.lines[0])
				break;
			v = new Buffer(reply.lines[0], "base64");
			hmac = crypto.createHmac("md5", new Buffer(opts.password, "utf8"));
			hmac.update(v);
			v = hmac.digest("hex");
			v = "" + opts.username + " " + v;
			v = new Buffer(v, "utf8").toString("base64");
			return v;
	}
}

function am_digestmd5(opts, round, reply) {
	var v, q, r, a1, a2;

	switch (round) {
		case 0:
			return "AUTH DIGEST-MD5";
		case 1:
			if (!reply.lines[0])
				break;
			v = new Buffer(reply.lines[0], "base64").toString("ascii");
			q = parseDigest(v);
			// validate query challenge
			if (!q.qop || q.qop.indexOf("auth") === -1)
				break;
			// todo: perform additional validations as per rfc2831
			r = {};
			r.username = opts.username;
			r.realm = q.realm[0] || opts.realm;
			r.nonce = q.nonce;
			r.nc = "00000001"; // always 1 in case of SMTP
			r.cnonce = crypto.pseudoRandomBytes(16).toString("hex");
			r.qop = "auth";
			r.charset = q.charset;
			r["digest-uri"] = "smtp/" + r.realm;

			// strip any unused values from response
			Object.keys(r).forEach(function (k) {
				if (r[k] === undefined)
					delete r[k];
			});

			// calculate response value
			a1 = [r.username, r.realm || "", opts.password].join(":");
			a1 = calcHash(a1, r.charset); // this is the only place where we specify charset as only un and pw are allowed to contain int chars (if server supports utf8)
			v = ":" + [r.nonce, r.cnonce].join(":");
			v = new Buffer(v, "ascii");
			a1 = Buffer.concat([a1, v]); // concat bytes representation of a1 : nonce : cnonce
			a1 = calcHash(a1).toString("hex");
			a2 = "AUTHENTICATE:" + r["digest-uri"];
			a2 = calcHash(a2).toString("hex");
			v = [a1, r.nonce, r.nc, r.cnonce, r.qop, a2].join(":");
			r.response = calcHash(v).toString("hex");
			v = formatDigest(r);
			v = new Buffer(v, "ascii").toString("base64");
			return v;
		case 2:
			if (!reply.lines[0])
				break;
			v = new Buffer(reply.lines[0], "base64").toString("ascii");
			q = parseDigest(v);
			if (q.rspauth) // todo: check rspauth for validity?
				return "";
	}
}

function parseDigest(s) {
	// the tokenizer is a bit crazy but it works. explanation of /"((?:[^"\\]|\\.)+)"/ clause:
	// two quotes surrounding zero or more of "any character that's not a quote or a backslash" or "a backslash followed by any character"
	var re = /([a-z0-9\-]+)=(?:(?:"((?:[^"\\]|\\.)+)")|([^,]+))/g,
		d = { realm: [] }, m, v;

	s = s.replace(/\r?\n\s+/, " "); // unfold
	while (m = re.exec(s)) {
		v = m[2] || m[3];
		if (m[2]) // string is a quoted string. process escaped characters
			v = v.replace(/\\(.)/g, "$1");
		switch (m[1]) {
			case "realm":
				d.realm.push(v);
				break;
			case "qop":
				d.qop = v ? v.split(/, ?/g) : [];
				break;
			default:
				d[m[1]] = v;
				break;
		}
	}

	return d;
}

function formatDigest(d) {
	var ret = "";
	Object.keys(d).forEach(function (k, i) {
		if (i > 0)
			ret += ",";
		ret += k + "=";
		switch (k) {
			case "username":
			case "realm":
			case "nonce":
			case "cnonce":
			case "qop":
			case "digest-uri":
				ret += '"' + d[k].replace(/"/g, '\\"') + '"';
				break;
			default:
				ret += d[k];
				break;
		}
	});
	return ret;
}

function calcHash(data, enc) {
	var hash = crypto.createHash("md5");
	hash.update(data, enc); // enc will defaults to ascii if not defined or invalid
	data = hash.digest();
	return data;
}

module.exports = {
	"plain": am_plain,
	"login": am_login,
	"cram-md5": am_crammd5,
	"digest-md5": am_digestmd5
};
