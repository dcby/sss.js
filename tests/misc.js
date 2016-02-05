var util = require("util"),
	lib = require("../lib");

//var date = new Date();
//console.log(lib.dateTo2822(date));

//var name = "Lk-Phone";
//name = lib.toCamelCase(name);
//console.log(name);

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

var arr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
for (var i = 0; i < 1000000; i++) {
	arr[getRandomInt(0, 10)]++;
}

console.log(arr);