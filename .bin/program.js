#!/usr/bin/env node

var program = require("commander"),
	sss = require("../index"),
	pkg = require("../package.json");

var sender;

process
	.on("uncaughtException", function (err) {
		console.error(err.stack || err.toString());
		console.error("critical error. exiting");
		process.exit(1);
	})
	.on("SIGHUP", onsignal)
	.on("SIGINT", onsignal)
	.on("SIGTERM", onsignal)
	.on("SIGBREAK", onsignal);

function onsignal() {
	if (sender)
		sender.cancel();
}

program
	.version(pkg.version)
	.command("send <project>")
	.description("send the project")
	.option("-s, --start [record]", "specify start record")
	.option("-e, --end [record]", "specify end record", parseInt)
	.option("-c, --count [records]", "specify number of records", parseInt)
	.option("--to [email]", "override 'to'")
	.option("--test", "'test' mode")
	.action(function (project, cmd) {
		var opts = {};
		cmd.options.forEach(function (v) {
			opts[v.name()] = cmd[v.name()];
		});
		sender = sss(project, opts);
		sender.send();
	});
program
	.parse(process.argv);

if (!program.args.length)
	program.help();
