#!/usr/bin/env node

var program = require("commander"),
	project = require("../project"),
	pkg = require("../package.json");

program
	.version(pkg.version)
	.command("get <project> <path>")
	.description("get value")
	.action(function (prj, path, cmd) {
		var opts = {}, p, ret;
		cmd.options.forEach(function (v) {
			opts[v.name()] = cmd[v.name()];
		});

		p = project.load(prj);
		ret = eval("p" + path);
		console.log(ret);
	});
program
	.parse(process.argv);

if (!program.args.length)
	program.help();
