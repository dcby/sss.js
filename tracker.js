var http = require("http"),
	https = require("https"),
	url = require("url"),
	pkg = require("./package.json");

function Tracker(opts) {
	var _opts = opts || {};

	function _track(opts, callback) {
		var client,
			err,
			data = "";
		var entity = {
			type: opts.type,
			project: opts.project || _opts.project,
			db: opts.db || _opts.db,
			agent: { name: "sss", version: pkg.version },
			record: opts.record,
			isLastRecord: opts.isLastRecord
		};
		if (!entity.isLastRecord)
			delete entity.isLastRecord;

		// make raw data
		var buf = new Buffer(JSON.stringify(entity), "utf8");

		// request options
		var ropts = url.parse(opts.uri || _opts.uri);
		ropts.method = "POST";
		ropts.agent = false;
		ropts.headers = {
			"Content-Type": "application/json",
			"Content-Length": buf.length
		};

		client = ropts.protocol === "https:" ? https : http;

		var req = client.request(ropts)
			.on("response", function (res) {
				res
					.on("data", function (chunk) {
						data = data + chunk;
					})
					.on("end", function () {
						if (res.statusCode === 200 || res.statusCode === 204) {
							callback(null);
							return;
						}
						// problems
						err = new Error(res.statusCode + ": " + res.statusMessage);
						err.data = data;
						callback(err);
					});
			})
			.on("error", function (err) {
				callback(err);
			});
		req.setTimeout(5000);
		req.write(buf);
		req.end();
	}

	this._track = _track;
}

Tracker.prototype.track = function (opts, callback) { this._track(opts, callback); };

exports.Tracker = Tracker;