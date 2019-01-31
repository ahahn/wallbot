const repl = require('repl');
const fs = require('fs');
const SerialPort = require('serialport')
const Readline = SerialPort.parsers.Readline
const due = '/dev/cu.usbserial-A9007RfU'
const uno = '/dev/cu.usbmodem1421'
const port = new SerialPort(uno, {
	baudRate:19200
});
const parser = new Readline();
const replServer = repl.start({ prompt: '> '});
var commandList = [];

var previewWriteStream;
var useLetter = letterH;
var scale = 1;

const mmFactor = 5;

var canvasWidth = 1000;
var canvasHeight = 700;
// yfactor:
// 600x600: .09
// 940x700:
// 8x8 (80x80) .09
// 12x16 (120x160) .18
var yFactor =  .18;
var curX = Math.round(canvasWidth/2);
var curY = Math.round(canvasHeight/2);

var rightLength = Math.round(Math.sqrt(Math.pow(canvasWidth * mmFactor / 2, 2)+Math.pow(canvasHeight * mmFactor /2, 2)));
var leftLength = Math.round(Math.sqrt(Math.pow(canvasWidth * mmFactor / 2, 2)+Math.pow(canvasHeight * mmFactor /2, 2)));

replServer.defineCommand('commands',{
	help: 'Read commands available from arduino',
	action() {
		sendCommand("?");
	}
});
replServer.defineCommand('position',{
	help: 'Read current position from arduino',
	action() {
		sendCommand("p");
	}
});
replServer.defineCommand('release',{
	help: 'Release stepper motors',
	action() {
		sendCommand("f");
	}
});
replServer.defineCommand('origin',{
	help: 'Return to origin',
	action() {
		sendCommand("o");
	}
});
replServer.defineCommand('penup',{
	help: 'Move pen from surface',
	action() {
		sendCommand("u");
	}
});
replServer.defineCommand('free',{
	help: 'Free motors',
	action() {
		sendCommand("f");
	}
});
replServer.defineCommand('pendown',{
	help: 'Move pen to surface',
	action() {
		sendCommand("d");
	}
});
replServer.defineCommand('fillareaarctest',{
	help: 'Test filling an area by arcs',
	action() {
		console.log('buffering fill area arc commands');
		fillAreaArcTest();
		sendCommand(commandList.shift());
	}
});
replServer.defineCommand('testangles',{
	help: 'Test angle functions',
	action() {
		testAngles();
	}
});
replServer.defineCommand('go',{
	help: 'Move X and Y distance specified',
	action(coords) {
		console.log('read coords',coords);
		var c = coords.match(/-?\d+/g).map(Number);
		console.log('X ',c[0]);
		console.log('Y ',c[1]);
		sendCommand('g ' + c[0] +' ' + c[1]);
	}
});
replServer.defineCommand('right',{
	help: 'Change right length distance specified',
	action(dist) {
		console.log('read dist',dist);
		var c = dist.match(/-?\d+/g).map(Number);
		console.log('distance ' + c[0] + ' rightLength now ' + rightLength);
		changeRight(c[0]);
		// sendCommand('r ' + c[0] );
	}
});
replServer.defineCommand('scale',{
	help: 'Set scale for line letters',
	action(scaleParam) {
		console.log('read scale',scaleParam);
		var c = scaleParam.match(/-?\d+/g).map(Number);
		scale = c[0];
	}
});
replServer.defineCommand('write',{
	help: 'Write the text as line letters',
	action(message) {
		if (message.length > 0) {
			console.log('read message',message);
			var first = true;
			for (let i = 0; i < message.length; i++) {
				let found = false;
				let j = 0;
				console.log('writing :' + message[i] + ':');
				if (message[i] == ' ') {
					commandList.push('g ' + (4 * scale) + ' 0');
				}
				while ((j < lineLetters.length) && !found) {
					if (lineLetters[j].letter === message[i]) {
						console.log('writing ' + message[i]);
						if (!first) {
							// make space
							commandList.push('g ' + (2 * scale) + ' 0');
						}
						writeLetter(lineLetters[j]);
						first = false;
						found = true;
					}
					j++;
				}
				if (!found) {
					console.log('couldn\'t find letter ' + message[i]);
				}
			}
			sendCommand(commandList.shift());
		} else {
			console.log('Usage: write <string>');
		}

	}
});
function writeLetter(letter) {
	var down = false;
	if ((letter.startingPoint.X != 0)||(letter.startingPoint.Y != 0)) {
		commandList.push('g ' + (letter.startingPoint.X * scale) + ' ' + (letter.startingPoint.Y * scale));
	}
	commandList.push('d');
	down = true;
	for (let i = 0; i < letter.lines.length;i++) {
		if ((letter.lines[i].up == 1)&&(down)) {
			commandList.push('u');
			down = false;
		}
		commandList.push('g ' + (letter.lines[i].X * scale)+ ' ' + (letter.lines[i].Y * scale));
		// don't put the pen down if you're just going to raise it again
		if ((letter.lines[i].up == 1)&&(letter.lines.length > (i+1)) &&(!down)) {
			commandList.push('d');
			down = true;
		}
	}
	if (down) {
		commandList.push('u');
	}
}
replServer.defineCommand('scaletest',{
	help: 'Test scaling a letter',
	action() {
		console.log('scaling letter');
		scaleLetter(letterH, 2);
	}
});
function optimizePaths(segments) {
	console.log('segments length is ' + segments.length);
	var finalPaths = [];
	var current = segments.shift();
	var startRight = current.rightLengthEnd;
	var shortest = Number.MAX_SAFE_INTEGER;
	var shortestIndex = -1;
	var nextStartRight = -1;
	while (segments.length > 0) {
		finalPaths.push(current);
		console.log('current segment is ' + JSON.stringify(current));
		console.log('finalPaths is length ' + finalPaths.length);
		console.log('startRight is ' + startRight);
		shortest = Number.MAX_SAFE_INTEGER;
		shortestIndex = -1;
		nextStartRight = -1;
		for (var i = 0; i < segments.length; i++) {
			var leftDist = Math.abs(current.leftLength - segments[i].leftLength);
			var startRightDist = Math.abs(startRight - segments[i].rightLengthStart);
			var endRightDist = Math.abs(startRight - segments[i].rightLengthEnd);
			var startLength = Math.sqrt(Math.pow(leftDist,2) + Math.pow(startRightDist,2));
			var endLength = Math.sqrt(Math.pow(leftDist,2) + Math.pow(endRightDist,2));
			var shortestCurrent = Math.min(startLength,endLength);
			// console.log('comparing segment ' + JSON.stringify(segments[i]));
			// console.log('leftDist ' + leftDist + ' startLength ' + startLength + ' endLength ' + endLength + ' srd ' + startRightDist + ' erd ' + endRightDist);
			// console.log('index ' + i + ' shortestCurrent ' + shortestCurrent + ' shortest ' + shortest);
			if (isNaN(shortestCurrent)) return;
			if (shortestCurrent < shortest) {
				shortestIndex = i;
				shortest = shortestCurrent;
				if (startLength < endLength) {
					nextStartRight = segments[i].rightLengthEnd;
				} else {
					nextStartRight = segments[i].rightLengthStart;
				}
				// console.log('new shortest index ' + shortestIndex + ' next start ' + nextStartRight);
			}
		}
		current = segments.splice(shortestIndex,1)[0];
		startRight = nextStartRight;
	}
	finalPaths.push(current);
	console.log('finalPaths length is ' + finalPaths.length);
	return finalPaths;
}
function drawSegments(segments) {
	previewWriteStream = fs.createWriteStream("wallbot-drawing.html");
	outputPreviewHeader();
	var c;
	var curLeft = leftLength;
	var curRight = rightLength;
	while (seg = segments.shift()) {
		previewWriteStream.write(JSON.stringify(seg) + ',\r\n', 'ascii');
		commandList.push('# ' + JSON.stringify(seg));
		var startRight;
		var endRight;
		var rightShift;
		if (Math.abs(curRight - seg.rightLengthStart) < Math.abs(curRight - seg.rightLengthEnd)) {
			startRight = seg.rightLengthStart;
			endRight = seg.rightLengthEnd;
			rightShift = startRight - curRight;
		} else {
			// console.log('endRight is closer- length ' + curRight);
			endRight = seg.rightLengthStart;
			startRight = seg.rightLengthEnd;
			rightShift = startRight - curRight;
			// rightShift = curRight - startRight;
		}
		if (seg.leftLength != leftLength) {
			c = "l " + (seg.leftLength - curLeft);
			// console.log(c);
			commandList.push(c);
			curLeft += (seg.leftLength - curLeft);
		}
		if (startRight != curRight) {
			// c = "r " + (startRight - curRight);
			c = "r " + rightShift;
			// console.log(c);
			commandList.push(c);
			curRight += rightShift;
			// curRight += (startRight - curRight);
		}
		// if (seg.rightLengthStart != rightLength) {
		// 	c = "r " + (seg.rightLengthStart - curRight);
		// 	// console.log(c);
		// 	commandList.push(c);
		// 	curRight += (seg.rightLengthStart - curRight);
		// }
		commandList.push("d");
		c = "r " + (endRight - curRight);
		// c = "r " + (seg.rightLengthEnd - curRight);
		// console.log(c);
		commandList.push(c);
		commandList.push("u");
		// curRight += (seg.rightLengthEnd - curRight);
		curRight += (endRight - curRight);
	}
	outputPreviewFooter();
	previewWriteStream.end();
}
function drawSegmentsUnidirectional(segments) {
	previewWriteStream = fs.createWriteStream("wallbot-drawing.html");
	outputPreviewHeader();
	var c;
	var curLeft = leftLength;
	var curRight = rightLength;
	while (seg = segments.shift()) {
		previewWriteStream.write(JSON.stringify(seg) + ',\r\n', 'ascii');
		commandList.push('# ' + JSON.stringify(seg));
		var startRight;
		var endRight;
		var rightShift;
		if (seg.leftLength != leftLength) {
			c = "l " + (seg.leftLength - curLeft);
			// console.log(c);
			commandList.push(c);
			curLeft += (seg.leftLength - curLeft);
		}
		if (seg.rightLengthStart != rightLength) {
			c = "r " + (seg.rightLengthStart - curRight);
			// console.log(c);
			commandList.push(c);
			curRight += (seg.rightLengthStart - curRight);
		}
		commandList.push("d");
		c = "r " + (seg.rightLengthEnd - curRight);
		// console.log(c);
		commandList.push(c);
		commandList.push("u");
		curRight += (seg.rightLengthEnd - curRight);
	}
	outputPreviewFooter();
	previewWriteStream.end();
}
replServer.defineCommand('useletter',{
	help: 'Set letter to draw',
	action(params) {
		if (params === 'letterH_hollow') {
			useLetter = letterH_hollow;
		} else {
			useLetter = letterH;
		} 
	}
});
replServer.defineCommand('lettertest',{
	help: 'Test slicing a letter- params <scale> <spacing>',
	action(params) {
		console.log('slicing letter');
		console.log('starting from X ' + curX + ' Y ' + curY);
		console.log('leftLength ' + leftLength + ' rightLength ' + rightLength);
		console.log('params ' + params);
		if ((params == null)||(params == "")) {
			params = "10 30";
		}
		var c = params.match(/-?\d+/g).map(Number);
		var scale = c[0] || 1;
		var spacing = c[1] || 10;
		console.log('got scale ' + scale + ' spacing ' + spacing);

		var coords = getCoordsForRightChange(leftLength,rightLength,0);
		curX = Math.abs(Math.round(coords.X / mmFactor));
		curY = Math.abs(Math.round(coords.Y / mmFactor));
		var startLeft = leftLength;
		var startRight = rightLength;
		var firstSegments = sliceLetter(scale,spacing);
		console.log('calling optimizePaths');
		var finalSegments = optimizePaths(firstSegments);
		console.log('back from optimizePaths');

		leftLength = startLeft;
		rightLength = startRight;
		drawSegmentsUnidirectional(finalSegments);
		// drawSegments(finalSegments);

		// drawSegments(firstSegments);
		// while (oneCommand = commandList.shift()) {
		// 	console.log(JSON.stringify(oneCommand));
		// }
		// changeLeft(60);
		// changeRight(60);
		// drawSegments(secondSegments);
		var c = commandList.shift();
		while (c.startsWith("#")) {
			console.log(c);
			c = commandList.shift();
		}
		sendCommand(c);
	}
});
replServer.defineCommand('left',{
	help: 'Change left length distance specified',
	action(dist) {
		console.log('read dist',dist);
		var c = dist.match(/-?\d+/g).map(Number);
		console.log('distance ' + c[0] + ' leftLength now ' + leftLength);
		changeLeft(c[0]);
		// sendCommand('l ' + c[0] );
	}
});
function changeRight(steps) {
	rightLength += steps;
	sendCommand('r ' + steps);
}
function changeLeft(steps) {
	leftLength += steps;
	sendCommand('l ' + steps);
}
replServer.defineCommand('fillareatest',{
	help: 'Test fill area process',
	action(dist) {
		console.log('buffering fill area commands');
		fillAreaTest();
		sendCommand(commandList.shift());
	}
});
port.on("open", function () {
    console.log('Serial port connected');
});
port.pipe(parser);
parser.on('data', function(data) {
	console.log('read data ' + data);
	if (data.trim()[0] === '{') {
		var response = JSON.parse(data);
		if (response.result) {
			if (response.result.lines) {
				for (var l of response.result.lines) {
					console.log(l);
				}
			} else if (response.result.message) {
				console.log("Read response message: ",response.result.message);
			} else {
				console.log("Read response: ", response.result);
			}
			if (commandList.length > 0) {
				var c = commandList.shift();
				while (c.startsWith("#")) {
					console.log(c);
					c = commandList.shift();
				}
				sendCommand(c);
			}
		} else {
			console.log('Read json response:',JSON.stringify(response));
		}
	} else {
    	console.log('Read:',data);
	}
    if (data.toString().trim() === 'ready') {
    	console.log('arduino ready');
		// console.log('sending ?');
		// sendCommand("?");
		// port.write("?\r");
		// console.log('sent ?');
    }
});

function sendCommand(command) {
	if (command.startsWith("#")) {
		console.log(command);
		return;
	}
	console.log('sending command ',command);
	port.write(command + "\r");
}

function testAngles() {
	console.log('testing right changes');
	var coords = getCoordsForRightChange(leftLength,rightLength,0);
	console.log('got coords ' + coords.X + ' ' + coords.Y);
	var lengths = getLengthsForCoords(coords.X, coords.Y);
	console.log('leftLength ' + lengths.leftLength + ' rightLength ' + lengths.rightLength);
	coords = getCoordsForRightChange(leftLength,rightLength,10 * mmFactor);
	console.log('got coords ' + coords.X + ' ' + coords.Y);
	lengths = getLengthsForCoords(coords.X, coords.Y);
	console.log('leftLength ' + lengths.leftLength + ' rightLength ' + lengths.rightLength);
	coords = getCoordsForRightChange(leftLength,rightLength,-10 * mmFactor);
	console.log('got coords ' + coords.X + ' ' + coords.Y);
	lengths = getLengthsForCoords(coords.X, coords.Y);
	console.log('leftLength ' + lengths.leftLength + ' rightLength ' + lengths.rightLength);
	console.log('testing left changes');
	coords = getCoordsForLeftChange(rightLength,leftLength,0);
	console.log('got coords ' + coords.X + ' ' + coords.Y);
	lengths = getLengthsForCoords(coords.X, coords.Y);
	console.log('leftLength ' + lengths.leftLength + ' rightLength ' + lengths.rightLength);
	coords = getCoordsForLeftChange(rightLength,leftLength,10 * mmFactor);
	console.log('got coords ' + coords.X + ' ' + coords.Y);
	lengths = getLengthsForCoords(coords.X, coords.Y);
	console.log('leftLength ' + lengths.leftLength + ' rightLength ' + lengths.rightLength);
	coords = getCoordsForLeftChange(rightLength,leftLength,-10 * mmFactor);
	console.log('got coords ' + coords.X + ' ' + coords.Y);
	lengths = getLengthsForCoords(coords.X, coords.Y);
	console.log('leftLength ' + lengths.leftLength + ' rightLength ' + lengths.rightLength);
}
function goByArcs(x,y,ll,rl) {
	var adjustedX = x * mmFactor;
	var adjustedY = y * mmFactor;
	console.log('leftLength ' + ll + ' rightLength ' + rl);
	console.log('coords x ' + adjustedX + ' y ' + adjustedY);
	var lengths = getLengthsForCoords(adjustedX,adjustedY);
	console.log(JSON.stringify(lengths));
	commandList.push('p ' + x + ' ' + y);
	if ((lengths.leftLength - ll) < 0) {
		if (lengths.rightLength != rl) {
			commandList.push('r ' + (lengths.rightLength - rl));
			// changeRight(lengths.rightLength - rightLength);
		}
		if (lengths.leftLength != ll) {
			commandList.push('l ' + (lengths.leftLength - ll));
			// changeLeft(lengths.leftLength - leftLength);
		}

	} else {
		if (lengths.leftLength != ll) {
			commandList.push('l ' + (lengths.leftLength - ll));
			// changeLeft(lengths.leftLength - leftLength);
		}
		if (lengths.rightLength != rl) {
			commandList.push('r ' + (lengths.rightLength - rl));
			// changeRight(lengths.rightLength - rightLength);
		}
	}
	return({"rightLength":lengths.rightLength,"leftLength":lengths.leftLength});
}
function getLengthsForCoords(x,y) {
	var xSteps = x;
	var ySteps = y;
	var leftLength = Math.round(Math.sqrt(Math.pow(xSteps,2) + Math.pow(ySteps,2)));
	var rightLength = Math.round(Math.sqrt(Math.pow((canvasWidth * mmFactor)-xSteps,2) + Math.pow(ySteps,2)));
	return({'leftLength':leftLength,'rightLength':rightLength});
 }
function getCoordsForRightChange(leftRadius,rightRadius,rightChange) {
  var side = rightChange / 2;
  // console.log("radius " + leftRadius + ' side ' + side);
  var angle = Math.asin(side/leftRadius);
  // console.log("angle change is " + angle);
  // solve SSS triangle:
  // cos(C) = (a^2 + b^2 - c^2)/2ab
  // below gets angle at gondola
  // var squares = Math.pow(leftRadius,2) + Math.pow(rightRadius + rightChange,2) - Math.pow(canvasWidth * mmFactor,2);
  // var cosC = squares / (2 * leftRadius * (rightRadius + rightChange));
  var squares = Math.pow(leftRadius,2) + Math.pow(canvasWidth * mmFactor,2) - Math.pow(rightRadius + rightChange,2);
  var cosC = squares / (2 * leftRadius * (canvasWidth * mmFactor));
  var radianAngle = Math.acos(cosC);
  // console.log('angle in radians is ' + radianAngle);
  var x = Math.round(leftRadius * Math.sin(radianAngle + (Math.PI / 2)));
  var y = Math.round(leftRadius * Math.cos(radianAngle + (Math.PI / 2)));
  // console.log("x is ");
  // console.log(x);
  // console.log("y is ");
  // console.log(y);
  return {"X":x,"Y":y};
 }
function getCoordsForLeftChange(rightRadius,leftRadius,leftChange) {
  var side = leftChange / 2;
  console.log("radius " + rightRadius + ' side ' + side);
  var angle = Math.asin(side/rightRadius);
  // console.log("angle change is " + angle);
  // solve SSS triangle:
  // cos(C) = (a^2 + b^2 - c^2)/2ab
  // below gets angle at gondola
  // var squares = Math.pow(leftRadius,2) + Math.pow(rightRadius + rightChange,2) - Math.pow(canvasWidth * mmFactor,2);
  // var cosC = squares / (2 * leftRadius * (rightRadius + rightChange));
  var squares = Math.pow(rightRadius,2) + Math.pow(canvasWidth * mmFactor,2) - Math.pow(leftRadius + leftChange,2);
  var cosC = squares / (2 * rightRadius * (canvasWidth * mmFactor));
  var radianAngle = Math.acos(cosC);
  // console.log('angle in radians is ' + radianAngle);
  var x = (canvasWidth * mmFactor) - Math.round(rightRadius * Math.sin(radianAngle + (Math.PI / 2)));
  var y = Math.round(rightRadius * Math.cos(radianAngle + (Math.PI / 2)));
  // console.log("x is ");
  // console.log(x);
  // console.log("y is ");
  // console.log(y);
  return {"X":x,"Y":y};
 }
function getXForChange(radius, distance) {
  var side = distance / 2;
  console.log("radius ");
  console.log(radius);
  console.log("side ");
  console.log(side);
  var angle = asin(side/radius);
  console.log("angle change is ");
  console.log(angle);
  console.log("angle from 0 is ");
  console.log(angle + 90 + 45);
  //https://math.stackexchange.com/questions/260096/find-the-coordinates-of-a-point-on-a-circle
  var x = radius * sin(angle + 90 + 45);
  var y = radius * cos(angle + 90 + 45);
  console.log("x is ");
  console.log(x);
  console.log("y is ");
  console.log(y);
  return x;
}
function getDistanceToTargetX(radius, distance, targetX) {
  var x = getXForChange(radius,distance);
  var useDistance = distance;
  if (x > targetX) {
    while (x > targetX) {
      useDistance++;
      x = getXForChange(radius,useDistance);
    }
  } else if (x < targetX) {
    while (x < targetX) {
      useDistance--;
      x = getXForChange(radius,useDistance);
    }
  }
  console.log("Adjusted distance from ");
  console.log(distance);
  console.log(" to ");
  console.log(useDistance);
  return useDistance;
}
function fillArea(space) {
  var rightLength = sqrt(sq(long(canvasWidth) / 2)+sq(long(canvasHeight) /2));
  var leftLength = sqrt(sq(long(canvasWidth) / 2)+sq(long(canvasHeight) /2));
  console.log("rightLength ");
  console.log(rightLength);
  console.log("leftLength ");
  console.log(leftLength);
  var targetX = curX;
  var dist = getDistanceToTargetX((leftLength * mmFactor)+stepsLeft,80,(canvasWidth/2)-8);
  console.log("got dist ");
  console.log(dist);
}
var letterH = {"width":8,"height":8,"yFactor":.09,points:[
[1,1,0,0,0,0,1,1],
[1,1,0,0,0,0,1,1],
[1,1,0,0,0,0,1,1],
[1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1],
[1,1,0,0,0,0,1,1],
[1,1,0,0,0,0,1,1],
[1,1,0,0,0,0,1,1],
]};
var lineLetters = [
{"letter":"H","width":4,"height":8,"startingPoint":{"X":0,"Y":0},"lines":[
{"X":0,"Y":8},
{"X":0,"Y":-4,"up":1},
{"X":4,"Y":0},
{"X":0,"Y":4,"up":1},
{"X":0,"Y":-8},
]},
{"letter":"e","width":4,"height":8,"startingPoint":{"X":4,"Y":8},"lines":[
{"X":-4,"Y":0},
{"X":0,"Y":-4},
{"X":4,"Y":0},
{"X":0,"Y":2},
{"X":-4,"Y":0},
{"X":4,"Y":-6,"up":1}
]},
{"letter":"o","width":4,"height":8,"startingPoint":{"X":0,"Y":4},"lines":[
{"X":4,"Y":0},
{"X":0,"Y":4},
{"X":-4,"Y":0},
{"X":0,"Y":-4},
{"X":4,"Y":-4,"up":1}
]},
{"letter":"l","width":1,"height":8,"startingPoint":{"X":0,"Y":0},"lines":[
{"X":.5,"Y":0},
{"X":0,"Y":8},
{"X":.5,"Y":0},
{"X":0,"Y":-8,"up":1},
]},
];
var letterH_hollow = {"width":12,"height":16,"yFactor":.18,points:[
[1,1,1,1,0,0,0,0,1,1,1,1],
[1,0,0,1,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,1,0,0,1],
[1,0,0,1,1,1,1,1,1,0,0,1],
[1,0,0,0,0,0,0,0,0,0,0,1],
[1,0,0,0,0,0,0,0,0,0,0,1],
[1,0,0,0,0,0,0,0,0,0,0,1],
[1,0,0,0,0,0,0,0,0,0,0,1],
[1,0,0,1,1,1,1,1,1,0,0,1],
[1,0,0,1,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,1,0,0,1],
[1,1,1,1,0,0,0,0,1,1,1,1],
]};
var letterH_hollow_16 = {"width":16,"height":16,points:[
[1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1],
[1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
[1,0,0,1,1,1,1,1,1,1,1,1,1,0,0,1],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
[1,0,0,1,1,1,1,1,1,1,1,1,1,0,0,1],
[1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
[1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
[1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1],
]};
var emojiPoo = {"width":16,"height":16,points:[
[0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,],
[0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,],
[0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,],
[0,0,0,0,0,1,1,1,0,0,0,1,1,0,0,0,],
[0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,],
[0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,],
[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,],
[0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,],
[0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,],
[0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,],
[0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,],
[0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
[0,1,0,0,0,0,1,1,0,0,0,0,0,0,1,0,],
[0,0,1,1,1,1,0,0,1,1,1,1,1,1,0,0,],
]};
function sliceLetter(scale,spacing) {
	var segments = [];
	var letter = scaleLetter(useLetter,scale);
	console.log('letter X length ' + letter.points[0].length + ' Y length ' + letter.points.length);
	// console.log('letter 0 0 is ' + letter.points[0][0]);
	var firstX = curX;
	var firstY = curY;
	var lastX = curX + letter.points[0].length;
	var lastY = curY + letter.points.length;
	// console.log('lastX ' + lastX + ' lastY ' + lastY);
	var lastLengths = getLengthsForCoords(lastX * mmFactor, lastY * mmFactor);
	// console.log('lastlengths ' + JSON.stringify(lastLengths));

	var segment = 0;
	while ((leftLength <= lastLengths.leftLength)||(rightLength <= lastLengths.rightLength)) {
		var newCoords = getCoordsForRightChange(leftLength, rightLength,0);
		var newX = Math.abs(Math.round(newCoords.X / mmFactor)) - Math.abs(firstX);
		var newY = Math.abs(Math.round(newCoords.Y / mmFactor)) - Math.abs(firstY);
		// console.log('checking for coords ' + Math.round(newCoords.X/mmFactor) + ' ' + Math.round(newCoords.Y/mmFactor) + ' (letter ' + newX + ' ' + newY + ')');
		if ((newX >= 0) &&(newX < letter.points[0].length) && (newY >= 0) && (newY < letter.points.length)) {
			console.log('processing Y ' + newY + ' X ' + newX);
			// still within bounds for this letter
			var lastRightSpacing;
			var rightSpacing = 0;
			var startRight = NaN;
			var endRight = NaN;
			// var startRight = 0;
			// var endRight = 0;
			// console.log('backing out to top');
			var steps = 0;
			while ((newX >= 0) &&(newX < letter.points[0].length) && (newY >= 0) && (newY < letter.points.length)) {
				steps++;
				lastRightSpacing = rightSpacing;
				rightSpacing = rightSpacing - 5;
				newCoords = getCoordsForRightChange(leftLength, rightLength,rightSpacing);
				newX = Math.abs(Math.round(newCoords.X / mmFactor)) - Math.abs(firstX);
				newY = Math.abs(Math.round(newCoords.Y / mmFactor)) - Math.abs(firstY);
			}
			// console.log('out of letter bounds at ' + newY + ' ' + newX + ' after ' + steps + ' steps');
			// reset to last point within bounds
			newCoords = getCoordsForRightChange(leftLength, rightLength,lastRightSpacing);
			newX = Math.abs(Math.round(newCoords.X / mmFactor)) - Math.abs(firstX);
			newY = Math.abs(Math.round(newCoords.Y / mmFactor)) - Math.abs(firstY);
			// startRight = lastRightSpacing;
			// console.log('point ' + newY + ' ' + newX + ' is ' + letter.points[newY][newX]);
			if (letter.points[newY][newX] === 1) {
				// console.log('setting startright');
				startRight = lastRightSpacing;
			}
			// console.log('walking to bottom');
			steps = 0;
			while ((newX >= 0) &&(newX < letter.points[0].length) && (newY >= 0) && (newY < letter.points.length)) {
				steps++;
				letter.slicedPoints[newY][newX] = 1;
		        // console.log('newY ' + newY + ' newX ' + newX + ' marked sliced');
		        if (letter.points[newY][newX] === 1) {
		          if (isNaN(startRight)) {
		            // console.log('setting startRight at ' + newY + ' ' + newX);
		            startRight = lastRightSpacing;
		          }
		        } else {
		          if (!isNaN(startRight)) {
		            // console.log('got to end of segment');
		            console.log('startRight ' + startRight + ' end of segment ' + lastRightSpacing);
		            console.log('absolute startRight ' + (rightLength + startRight) + ' end of segment ' + (rightLength + lastRightSpacing));
		            segments.push({'segment':segment,'leftLength':leftLength,'rightLengthStart':(rightLength + startRight),'rightLengthEnd':(rightLength + lastRightSpacing)});
		            segment++;
		            startRight = NaN;
		          }
		        }
				lastRightSpacing = rightSpacing;
				rightSpacing = rightSpacing + 5;
				newCoords = getCoordsForRightChange(leftLength, rightLength,rightSpacing);
				newX = Math.abs(Math.round(newCoords.X / mmFactor)) - Math.abs(firstX);
				newY = Math.abs(Math.round(newCoords.Y / mmFactor)) - Math.abs(firstY);
			}
			// reset to last point within bounds
			newCoords = getCoordsForRightChange(leftLength, rightLength,lastRightSpacing);
			newX = Math.abs(Math.round(newCoords.X / mmFactor)) - Math.abs(firstX);
			newY = Math.abs(Math.round(newCoords.Y / mmFactor)) - Math.abs(firstY);
			console.log('newY ' + newY + ' newX ' + newX);

			// console.log('out of letter bounds at ' + newY + ' ' + newX + ' after ' + steps + ' steps');
			endRight = lastRightSpacing;
			if (!isNaN(startRight)) {
				console.log('startRight ' + startRight + ' endRight ' + endRight);
				console.log('absolute startRight ' + (rightLength + startRight) + ' endRight ' + (rightLength + endRight));
	            segments.push({'segment':segment,'leftLength':leftLength,'rightLengthStart':(rightLength + startRight),'rightLengthEnd':(rightLength + lastRightSpacing)});
	            segment++;
			}
			if (leftLength < lastLengths.leftLength) leftLength += spacing;
			if (rightLength < lastLengths.rightLength) rightLength += spacing / 4;
		// leftLength += spacing;
		// rightLength += Math.round(spacing * letter.yFactor);
		} else {
			// done!
			break;
			// console.log('breaking');
			var anotherPoint = 0;
			for (var ly=0;ly<letter.points.length;ly++) { 
				for (var lx=0;lx<letter.points[0].length;lx++) {
					if (letter.slicedPoints[ly][lx] != 1) {
						console.log('point '+ly +' '+lx+' unsliced');
						var lengths = getLengthsForCoords((lx + firstX) * mmFactor,(ly + firstY) * mmFactor);
						console.log('firstY ' + firstY + ' firstX ' + firstX);
						console.log('got coord lengths ' + JSON.stringify(lengths));
						console.log('leftLength ' + leftLength + ' rightLength ' + rightLength);
						leftLength = lengths.leftLength;
						rightLength = lengths.rightLength;
						anotherPoint = 1;
						break;
					}
					}
					if (anotherPoint === 1) {
						// console.log('got another point, breaking');
						break;
					}
			}
			// console.log('second break');
			if (anotherPoint === 0) {
				// console.log('no more points, breaking');
				break;
			}
		}
	}
	console.log('done letter, lenghts left ' + leftLength + ' right ' + rightLength);
	var seg;
	// while (seg = segments.shift()) {
	// 	console.log('segment: ' + JSON.stringify(seg));
	// }
	console.log('done processing letter is ' + JSON.stringify(letter));
	return segments;
}
function scaleLetter(letter,scale) {
	console.log('scaling letter ' + JSON.stringify(letter));
	console.log('scaling by ' + scale);
	if (scale == 1) {
		return letter;
	} else {
		var returnLetter = {"width": Math.round(letter.width * scale),
							"height": Math.round(letter.height * scale),
							"yFactor":letter.yFactor};
		returnLetter.points = new Array(letter.height * scale).fill(0).map(() => new Array(letter.width * scale).fill(0));
		returnLetter.slicedPoints = new Array(letter.height * scale).fill(0).map(() => new Array(letter.width * scale).fill(0));
		console.log('returnLetter is ' + JSON.stringify(returnLetter));
		var iv = 0;
		var jv = 0;
		for (var i = 0; i < letter.height; i++) {
			var iv = (i == 0)?0:i*scale;
			for (var j = 0; j < letter.width; j++) {
				var jv = (j == 0)?0:j*scale;
				for (v = 0; v < scale; v++) {
					for (w = 0; w < scale; w++) {
						returnLetter.points[iv + v][jv + w] = letter.points[i][j];
					}
				}
			}
		}
	}
	console.log('returning ' + JSON.stringify(returnLetter));
	return returnLetter;
}
function fillAreaBigArcTest() {
	var lengths = goByArcs(300,300,leftLength,rightLength);
	lengths = goByArcs(260,300,lengths.leftLength,lengths.rightLength);
	commandList.push('d');
	var coords = getCoordsForRightChange(leftRadius, rightRadius, 5);
	commandList.push('u');
	lengths = goByArcs(300,300,lengths.leftLength,lengths.rightLength);
}
function fillAreaArcTest() {
	var lengths = goByArcs(300,300,leftLength,rightLength);
	lengths = goByArcs(260,300,lengths.leftLength,lengths.rightLength);
	commandList.push('d');
	lengths = goByArcs(263,300,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,300,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,300,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,303,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,303,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,303,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,303,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,306,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,306,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,306,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,306,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,310,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,310,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,310,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,310,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,313,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,313,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,313,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,313,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,316,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,316,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,316,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,316,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(273,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(276,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(276,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(273,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(273,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(276,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(276,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(273,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,333,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,333,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,333,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,333,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,336,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,336,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,336,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,336,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,340,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,340,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,340,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,340,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,343,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,343,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,343,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,343,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,346,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,346,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,346,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,346,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(270,350,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(266,350,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(263,350,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(260,350,lengths.leftLength,lengths.rightLength);
	commandList.push('u');
	lengths = goByArcs(280,300,lengths.leftLength,lengths.rightLength);
	commandList.push('d');
	lengths = goByArcs(283,300,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,300,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,300,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,303,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,303,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,303,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,303,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,306,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,306,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,306,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,306,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,310,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,310,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,310,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,310,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,313,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,313,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,313,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,313,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,316,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,316,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,316,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,316,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,320,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,323,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,326,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,330,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,333,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,333,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,333,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,333,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,336,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,336,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,336,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,336,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,340,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,340,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,340,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,340,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,343,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,343,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,343,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,343,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,346,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,346,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,346,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,346,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(290,350,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(286,350,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(283,350,lengths.leftLength,lengths.rightLength);
	lengths = goByArcs(280,350,lengths.leftLength,lengths.rightLength);

	commandList.push('u');
	lengths = goByArcs(300,300,lengths.leftLength,lengths.rightLength);
}
function fillAreaTest() {
//  fillArea(8);
	commandList.push('d');
	commandList.push('r 8');

	commandList.push('l 8');
	commandList.push('r 8');
	commandList.push('r -28');
	commandList.push('l 8');
	commandList.push('r 32');
	commandList.push('l 8');
	commandList.push('r 12');
	commandList.push('r -56');
	commandList.push('l 8');
	commandList.push('r 60');
	commandList.push('l 8');
	commandList.push('r 12');
	commandList.push('r -84');
	commandList.push('l 8');
	commandList.push('r 88');
	commandList.push('l 8');
	commandList.push('r 12');
	commandList.push('r -112');
	commandList.push('l 8');
	commandList.push('r 116');
	commandList.push('l 8');
	commandList.push('r 12');
	commandList.push('r -140');
	commandList.push('l 8');
	commandList.push('r 144');
	commandList.push('l 8');
	commandList.push('r 12');
	commandList.push('r -168');

	commandList.push('l 8');
	commandList.push('r 172');
	commandList.push('l 8');
	commandList.push('r 12');
	commandList.push('r -196');

	commandList.push('l 8');
	commandList.push('r 200');
	commandList.push('l 8');
	commandList.push('r 12');
	commandList.push('r -224');

	commandList.push('l 8');
	commandList.push('r 228');
	commandList.push('l 8');
	commandList.push('r 12');
	commandList.push('r -256');

	commandList.push('u');

}
function outputPreviewHeader() {
	previewWriteStream.write('<html>','ascii');
previewWriteStream.write('<head>','ascii');
previewWriteStream.write('</head>','ascii');
previewWriteStream.write('<body bgcolor="#ffffff">','ascii');
previewWriteStream.write('<canvas id="myCanvas" width="500" height="500" style="border:1px solid #d3d3d3;">','ascii');
previewWriteStream.write('Your browser does not support the HTML5 canvas tag.</canvas>','ascii');
previewWriteStream.write('<script>','ascii');
previewWriteStream.write('var c = document.getElementById("myCanvas");','ascii');

previewWriteStream.write('var segments=[','ascii');
}
function outputPreviewFooter() {
	previewWriteStream.write('];','ascii');
previewWriteStream.write('var ctx = c.getContext("2d");','ascii');
previewWriteStream.write('ctx.beginPath();','ascii');
previewWriteStream.write('var seg;','ascii');
previewWriteStream.write('while (seg = segments.shift()) {','ascii');
previewWriteStream.write('console.log(\'drawing segment for \' + JSON.stringify(seg));','ascii');
previewWriteStream.write('ctx.moveTo((seg.leftLength/5)-300,(seg.rightLengthStart / 5)-300);','ascii');
previewWriteStream.write('ctx.lineTo((seg.leftLength / 5)-300,(seg.rightLengthEnd / 5)-300);','ascii');
previewWriteStream.write('ctx.stroke();','ascii');
previewWriteStream.write('}','ascii');
previewWriteStream.write('ctx.stroke();','ascii');
previewWriteStream.write('</script>','ascii');
previewWriteStream.write('</body>','ascii');
previewWriteStream.write('</html>','ascii');
}