const repl = require('repl');
const fs = require('fs');
const letters = require('./letters.js');
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
var scale = 8;
var spacing = 10;

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
var test = false;
var debug = false;
var font = 'lineLetters';
var lift = false;
var liftGap = 40;
var unidirectional = false;
var pause = false;

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
replServer.defineCommand('stop',{
	help: 'Remove any pending commands',
	action() {
		commandList = [];
	}
});
replServer.defineCommand('pause',{
	help: 'Stop sending pending commands',
	action() {
		pause = true;
	}
});
replServer.defineCommand('start',{
	help: 'Continue any pending commands',
	action() {
		pause = false;
		sendNextCommand();
	}
});
replServer.defineCommand('commands',{
	help: 'List any pending commands',
	action() {
		for (let i = 0;i<commandList.length;i++){
			console.log(JSON.stringify(commandList[i]));
		}
	}
});
replServer.defineCommand('font',{
	help: 'Set the font to use- lineLetters, block, block_hollow',
	action(fontParam) {
		let f = fontParam.trim();
		if (f=='lineLetters'||
			f=='block'||
			f=='block_hollow') {

			font = f;
			console.log('font now ' + font);
		}
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
replServer.defineCommand('canvas',{
	help: 'Define new canvas size in mm <x> <y>',
	action(sizes) {
		console.log('read sizes ',sizes);
		var c = sizes.match(/-?\d+/g).map(Number);
		console.log('X ',c[0]);
		console.log('Y ',c[1]);
		canvasWidth = c[0];
		canvasHeight = c[1];
		sendCommand('c ' + c[0] +' ' + c[1]);
		curX = Math.round(canvasWidth/2);
		curY = Math.round(canvasHeight/2);
		rightLength = Math.round(Math.sqrt(Math.pow(canvasWidth * mmFactor / 2, 2)+Math.pow(canvasHeight * mmFactor /2, 2)));
		leftLength = Math.round(Math.sqrt(Math.pow(canvasWidth * mmFactor / 2, 2)+Math.pow(canvasHeight * mmFactor /2, 2)));
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
replServer.defineCommand('spacing',{
	help: 'Set spacing for block letters',
	action(spacingParam) {
		console.log('read spacing ',spacingParam);
		var c = spacingParam.match(/-?\d+/g).map(Number);
		spacing = c[0];
	}
});
replServer.defineCommand('lift',{
	help: 'Lift pen even over short gaps',
	action() {
		lift = !lift;
		console.log('lift ' + lift);
	}
});
replServer.defineCommand('uni',{
	help: 'Draw block objects unidirectionally',
	action() {
		unidirectional = !unidirectional;
		console.log('unidrectional ' + unidirectional);
	}
});
replServer.defineCommand('liftgap',{
	help: 'Gap over which to draw',
	action(liftParam) {
		console.log('read liftgap ',liftParam);
		var c = liftParam.match(/-?\d+/g).map(Number);
		liftGap = c[0];
	}
});
replServer.defineCommand('status',{
	help: 'Read status of variables',
	action() {
		console.log('Current status:');
		console.log('Test:',test);
		console.log('Debug:',debug);
		console.log('Font:',font);
		console.log('Scale:',scale);
		console.log('Spacing:',spacing);
		console.log('Lift:',lift);
		console.log('Unidirectional:' + unidirectional);
	}
});
replServer.defineCommand('mode',{
	help: 'Set operating mode to test, debug or real',
	action(message) {
		if (message.trim().toLowerCase() == 'test') test = true;
		else if (message.trim().toLowerCase() == 'debug') debug = true;
		else {
			test = false;
			debug = false;
		}
		console.log('test is ' + test + ' debug is ' + debug);
	}
});
replServer.defineCommand('write',{
	help: 'Write the text as line letters',
	action(message) {
		if (message.length > 0) {
			commandList = [];
			previewWriteStream = fs.createWriteStream("wallbot-drawing.html");
			outputPreviewHeader();
			console.log('read message',message);
			var first = true;
			var letterX = curX * mmFactor;
			var letterY = curY * mmFactor;
			var control = false;
			for (let i = 0; i < message.length; i++) {
				let j = 0;
				console.log('writing :' + message[i] + ':');
				if (message[i] == ' ') {
					commandList.push('g ' + (4 * scale) + ' 0');
					letterX += (4 * scale);
					continue;
				} else if (message[i] == '\\') {
					control = true;
					continue;
				} else if (control) {
					if (message[i] == 'r') {
						console.log('got slash-r');
					}
					control = false;
					continue;
				}
				control = false;
				let l = letters[font][message[i]];
				if (debug) console.log('letter is ' + JSON.stringify(l));
				if ((l) && (Object.keys(l).length > 0)) {
					console.log('writing ' + message[i]);
					if (letters[font].style=='line') {
						if (!first) {
							// make space
							commandList.push('g ' + (2 * scale) + ' 0');
							letterX += (2 * scale) * mmFactor;
						}
						writeLineLetter(l);
					} else if (letters[font].style=='block') {
						var lengths = getLengthsForCoords(letterX,letterY);
						console.log('letterX ' + letterX + ' letterY ' + letterY);
						writeBlockLetter(l,lengths.leftLength,lengths.rightLength,letterX,letterY);
						letterX += (l.width * scale) * mmFactor;
						// make space
						commandList.push('g ' + (3 * scale) + ' 0');
						letterX += (3 * scale) * mmFactor;
					}
					first = false;
				} else {
					console.log('couldn\'t find letter ' + message[i]);
				}
			}
			outputPreviewFooter();
			previewWriteStream.end();
			if (commandList.length > 0) {
				sendCommand(commandList.shift());
			}
		} else {
			console.log('Usage: write <string>');
		}

	}
});
function writeBlockLetter(letter,leftLength,rightLength,curX,curY) {
	console.log('slicing letter ' + JSON.stringify(letter) + ' font ' + font);
	console.log('starting from X ' + curX + ' Y ' + curY);
	console.log('leftLength ' + leftLength + ' rightLength ' + rightLength);
	console.log('got scale ' + scale + ' spacing ' + spacing);

	var coords = getCoordsForRightChange(leftLength,rightLength,0);
	curX = Math.abs(Math.round(coords.X / mmFactor));
	curY = Math.abs(Math.round(coords.Y / mmFactor));
	var startLeft = leftLength;
	var startRight = rightLength;
	console.log('slicing ' + JSON.stringify(letter) + ' font ' + font);
	var slicedLetter = sliceLetter(letter,leftLength,rightLength,curX,curY);
	if (debug) console.log('calling optimizePaths');
	slicedLetter.finalSegments = optimizePaths(slicedLetter.segments);
	if (debug) console.log('back from optimizePaths');

	leftLength = startLeft;
	rightLength = startRight;
	if (unidirectional) {
		drawSegmentsUnidirectional(letter,slicedLetter,leftLength,rightLength);
	} else {
		console.log('drawing segments from letter ' + JSON.stringify(letter) + ' font ' + font);
		drawSegments(letter,slicedLetter,leftLength,rightLength);
	}
	sendNextCommand();
}
function sendNextCommand() {
	if (!test) {
		var c = commandList.shift();
		while (c.startsWith("#")) {
			console.log(c);
			c = commandList.shift();
		}
		sendCommand(c);
	}
}
function writeLineLetter(letter) {
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
		if (debug) {
			console.log('current segment is ' + JSON.stringify(current));
			console.log('finalPaths is length ' + finalPaths.length);
			console.log('startRight is ' + startRight);
		}
		shortest = Number.MAX_SAFE_INTEGER;
		shortestIndex = -1;
		nextStartRight = -1;
		var duplicates = [];
		for (var i = 0; i < segments.length; i++) {
			if ((segments[i])&&
				(current.leftLength == segments[i].leftLength)) {
				var duplicate = false;
				if 	((current.rightLengthStart == segments[i].rightLengthStart)&&
				(current.rightLengthEnd == segments[i].rightLengthEnd)) {
					if (debug) console.log('equal duplicate');
					duplicate = true;
				}
				if ((Math.abs(current.rightLengthStart - segments[i].rightLengthStart) < spacing)&&
				(Math.abs(current.rightLengthEnd - segments[i].rightLengthEnd) < spacing)) {
					if (debug) console.log('near duplicate');
					duplicate = true;
				}
				if (((current.rightLengthStart >= segments[i].rightLengthStart)&&(current.rightLengthEnd <= segments[i].rightLengthEnd) )||
				((current.rightLengthStart <= segments[i].rightLengthStart)&&(current.rightLengthEnd >= segments[i].rightLengthEnd) )) {
					if (debug) console.log('overlapping duplicate');
				}

				if (duplicate) {
					console.log('duplicating segments ' + JSON.stringify(segments[i]));
					duplicates.push(i);
					continue;
				}
			}
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
		if (duplicates.length > 0) {
			console.log('duplicates ' + duplicates.length);
			var removed = 0;
			for (var dup of duplicates) {
				if ((dup - removed) < shortestIndex) shortestIndex--;
				var s = segments.splice(dup - removed,1);
				removed++;
				console.log('removed duplicate segment ' + JSON.stringify(s));
			}
		}
		duplicates = [];
		current = segments.splice(shortestIndex,1)[0];
		startRight = nextStartRight;
	}
	finalPaths.push(current);
	console.log('finalPaths length is ' + finalPaths.length);
	return finalPaths;
}
function drawSegments(letter,slicedLetter,leftLength,rightLength) {
	var c;
	var curLeft = leftLength;
	var curRight = rightLength;
	var penUp = true;
	var segments = slicedLetter.finalSegments;
	console.log('start curLeft ' + curLeft + ' curRight ' + curRight);
	var startCoords = getCoordsForLeftChange(rightLength,leftLength,0);
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
			endRight = seg.rightLengthStart;
			startRight = seg.rightLengthEnd;
			rightShift = startRight - curRight;
		}
		if (seg.leftLength != leftLength) {
			c = "l " + (seg.leftLength - curLeft);
			commandList.push(c);
			curLeft += (seg.leftLength - curLeft);
		}
		if (startRight != curRight) {
			c = "r " + rightShift;
			commandList.push(c);
			curRight += rightShift;
		}
		if (penUp) {
			commandList.push("d");
			penUp = false;
		}
		c = "r " + (endRight - curRight);
		commandList.push(c);

		// figure out if we're close enough to leave pen down
		let nextDist = liftGap + 100;
		if (segments.length > 0) {
			let next = segments[0];
			if (next) {
				let nextStartRight = 0;
				if (Math.abs(curRight - next.rightLengthStart) < Math.abs(curRight - next.rightLengthEnd)) {
					nextStartRight = next.rightLengthStart;
				} else {
					nextStartRight = next.rightLengthEnd;
				}
				nextDist = Math.sqrt(Math.pow(curLeft - next.leftLength,2) + Math.pow(curRight - nextStartRight,2));
			}
		}
		if ((nextDist > liftGap)||(segments.length==0)) {
			if (!penUp) {
				commandList.push("u");
				penUp = true;
			}
		}

		curRight += (endRight - curRight);
	}
	commandList.push('p');
	console.log('end curLeft ' + curLeft + ' curRight ' + curRight);
	console.log('doneLengths ' + JSON.stringify(slicedLetter.doneLengths))
	var leftDiff = slicedLetter.doneLengths.leftLength - curLeft;
	var rightDiff = slicedLetter.doneLengths.rightLength - curRight;
	console.log('leftDiff ' + leftDiff + ' rightDiff ' + rightDiff);
	commandList.push('r ' + rightDiff);
	commandList.push('l ' + leftDiff);
	// var endCoords = getCoordsForLeftChange(curRight,curLeft,0);
	// var targetX = startCoords.X + ((letter.width * scale) * mmFactor);
	// console.log('startcoords ' + JSON.stringify(startCoords) + ' endcoords ' + JSON.stringify(endCoords) + ' diff Y ' + (startCoords.Y - endCoords.Y) + ' X ' + (targetX - endCoords.X) + ' tagetX ' + targetX);
	// if ((startCoords.Y != endCoords.Y)||(endCoords.X != targetX)) {
	// 	commandList.push('g ' + (targetX - endCoords.X) +' ' + (startCoords.Y - endCoords.Y));
	// }
	commandList.push('p');
}
function drawSegmentsUnidirectional(letter,slicedLetter,leftLength,rightLength) {
	var c;
	var curLeft = leftLength;
	var curRight = rightLength;
	var segments = slicedLetter.finalSegments;
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
	console.log('doneLengths ' + JSON.stringify(slicedLetter.doneLengths))
	var leftDiff = slicedLetter.doneLengths.leftLength - curLeft;
	var rightDiff = slicedLetter.doneLengths.rightLength - curRight;
	console.log('leftDiff ' + leftDiff + ' rightDiff ' + rightDiff);
	commandList.push('r ' + rightDiff);
	commandList.push('l ' + leftDiff);
}
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
			if ((commandList.length > 0)&&(!pause)) {
				var c = commandList.shift();
				while (c.startsWith("#")) {
					console.log(c);
					c = commandList.shift();
				}
				if (!test) {
					sendCommand(c);
				}
			}
		} else {
			console.log('Read json response:',JSON.stringify(response));
		}
	} else {
    	console.log('Read:',data);
	}
    if (data.toString().trim() === 'ready') {
    	console.log('arduino ready');
    }
});

function sendCommand(command) {
	if (command.startsWith("#")) {
		console.log(command);
		return;
	}
	console.log('sending command ',command);
	if (!test) {
		port.write(command + "\r");
	}
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
function getAngleForRightLengths(leftRadius,rightRadius,rightRadiusEnd) {
  // var side = rightChange / 2;
  // var angle = Math.asin(side/leftRadius);
  var origSquares = Math.pow(leftRadius,2) + Math.pow(canvasWidth * mmFactor,2) - Math.pow(rightRadius,2);
  var origCosC = origSquares / (2 * leftRadius * (canvasWidth * mmFactor));
  var origRadianAngle = Math.acos(origCosC);
  var squares = Math.pow(leftRadius,2) + Math.pow(canvasWidth * mmFactor,2) - Math.pow(rightRadiusEnd,2);
  var cosC = squares / (2 * leftRadius * (canvasWidth * mmFactor));
  var radianAngle = Math.acos(cosC);
  var startAngle;
  var endAngle;
  if (origRadianAngle < radianAngle) {
  	startAngle = origRadianAngle;
  	endAngle = radianAngle;
  } else {
  	startAngle = radianAngle;
  	endAngle = origRadianAngle;
  }
  return {"radius":leftRadius,"origRadianAngle":startAngle,"finalRadianAngle":endAngle};
 }
function getAngleForRightChange(leftRadius,rightRadius,rightChange) {
  // var side = rightChange / 2;
  // var angle = Math.asin(side/leftRadius);
  var origSquares = Math.pow(leftRadius,2) + Math.pow(canvasWidth * mmFactor,2) - Math.pow(rightRadius,2);
  var origCosC = origSquares / (2 * leftRadius * (canvasWidth * mmFactor));
  var origRadianAngle = Math.acos(origCosC);
  var squares = Math.pow(leftRadius,2) + Math.pow(canvasWidth * mmFactor,2) - Math.pow(rightRadius + rightChange,2);
  var cosC = squares / (2 * leftRadius * (canvasWidth * mmFactor));
  var radianAngle = Math.acos(cosC);
  var startAngle;
  var endAngle;
  if (origRadianAngle < radianAngle) {
  	startAngle = origRadianAngle;
  	endAngle = radianAngle;
  } else {
  	startAngle = radianAngle;
  	endAngle = origRadianAngle;
  }
  return {"radius":leftRadius,"origRadianAngle":startAngle,"finalRadianAngle":endAngle};
 }
function getCoordsForLeftChange(rightRadius,leftRadius,leftChange) {
  var side = leftChange / 2;
  console.log("radius " + rightRadius + ' side ' + side);
  var angle = Math.asin(side/rightRadius);
  // solve SSS triangle:
  // cos(C) = (a^2 + b^2 - c^2)/2ab
  // below gets angle at gondola
  // var squares = Math.pow(leftRadius,2) + Math.pow(rightRadius + rightChange,2) - Math.pow(canvasWidth * mmFactor,2);
  // var cosC = squares / (2 * leftRadius * (rightRadius + rightChange));
  var squares = Math.pow(rightRadius,2) + Math.pow(canvasWidth * mmFactor,2) - Math.pow(leftRadius + leftChange,2);
  var cosC = squares / (2 * rightRadius * (canvasWidth * mmFactor));
  var radianAngle = Math.acos(cosC);
  var x = (canvasWidth * mmFactor) - Math.round(rightRadius * Math.sin(radianAngle + (Math.PI / 2)));
  var y = Math.abs(Math.round(rightRadius * Math.cos(radianAngle + (Math.PI / 2))));
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
function sliceLetter(letterParam,leftLength,rightLength,curX,curY) {
	var slicedLetter = {};
	var segments = [];
	var letter = scaleLetter(letterParam);
	console.log('letter X length ' + letter.points[0].length + ' Y length ' + letter.points.length);
	console.log('cur X ' + curX + ' curY ' + curY);
	// console.log('letter 0 0 is ' + letter.points[0][0]);
	var firstX = curX;
	var firstY = curY;
	var lastX = curX + letter.points[0].length;
	var lastY = curY + letter.points.length;
	// console.log('lastX ' + lastX + ' lastY ' + lastY);
	var doneLengths = getLengthsForCoords(lastX * mmFactor, firstY * mmFactor);
	console.log('doneLengths ' + JSON.stringify(doneLengths));
	slicedLetter.doneLengths = doneLengths;
	var lastLengths = getLengthsForCoords(lastX * mmFactor, lastY * mmFactor);
	if (test) {
		console.log('lastlengths ' + JSON.stringify(lastLengths));
		console.log('leftLength ' + leftLength +' rightLength ' + rightLength);
	}

	var segment = 0;
	while (leftLength <= lastLengths.leftLength) {
		var newCoords = getCoordsForRightChange(leftLength, rightLength,0);
		var newX = Math.abs(Math.round(newCoords.X / mmFactor)) - Math.abs(firstX);
		var newY = Math.abs(Math.round(newCoords.Y / mmFactor)) - Math.abs(firstY);
		var changes = 0;
		var rightChanges = false;
		while ((changes < 10)&& ((newY < 0)||(newY >= letter.points.length))) {
			changes++;
			if (debug)
			console.log('adjusting from newX ' + newX + ' newY ' + newY);
			if (leftLength <= lastLengths.leftLength) {
				if (newY < 0) {
					rightLength += spacing;
					rightChanges = true;
					if (debug)
					console.log('increased rightLength to ' + rightLength);
				}
				if (newY >= letter.points.length) {
					rightChanges = true;
					rightLength -= spacing / 4;
					if (debug)
					console.log('decreased rightLength to ' + rightLength);
				}
			}
			newCoords = getCoordsForRightChange(leftLength, rightLength,0);
			newX = Math.abs(Math.round(newCoords.X / mmFactor)) - Math.abs(firstX);
			newY = Math.abs(Math.round(newCoords.Y / mmFactor)) - Math.abs(firstY);
			if (debug)
			console.log('adjusted newX ' + newX + ' newY ' + newY);
		}
		if (changes >= 10) {
			console.log('gave up looking right after ' + changes + ' tries');
		}
		changes = 0;
		while ((!rightChanges)&&(changes < 10)&& ((newX < 0)||(newX >= letter.points[0].length))) {
			changes++;
			if (debug)
			console.log('adjusting from newX ' + newX + ' newY ' + newY);
			if (rightLength <= lastLengths.rightLength) {
				if (newX < 0) {
					leftLength += spacing;
					if (debug)
					console.log('increased leftLength to ' + leftLength);
				}
				if (newX >= letter.points[0].length) {
					leftLength -= spacing
					if (debug)
					console.log('decreased leftLength to ' + leftLength);
				}
			}
			newCoords = getCoordsForRightChange(leftLength, rightLength,0);
			newX = Math.abs(Math.round(newCoords.X / mmFactor)) - Math.abs(firstX);
			newY = Math.abs(Math.round(newCoords.Y / mmFactor)) - Math.abs(firstY);
			if (debug)
			console.log('adjusted newX ' + newX + ' newY ' + newY);
		}
		if (changes >= 10) {
			console.log('gave up looking left after ' + changes + ' tries');
		}
		// console.log('checking for coords ' + Math.round(newCoords.X/mmFactor) + ' ' + Math.round(newCoords.Y/mmFactor) + ' (letter ' + newX + ' ' + newY + ')');
		if ((newX >= 0) &&(newX < letter.points[0].length) && (newY >= 0) && (newY < letter.points.length)) {
			if (debug) console.log('processing Y ' + newY + ' X ' + newX);
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
		            if (debug) console.log('startRight ' + startRight + ' end of segment ' + lastRightSpacing);
		            if (debug) console.log('absolute startRight ' + (rightLength + startRight) + ' end of segment ' + (rightLength + lastRightSpacing));
					var angles = getAngleForRightLengths(leftLength,rightLength + startRight,rightLength + lastRightSpacing);
					// var angles = getAngleForRightChange(leftLength,rightLength + startRight,lastRightSpacing);
					// var angles = getAngleForRightChange(leftLength,rightLength + startRight,(rightLength + startRight) - (rightLength + lastRightSpacing));
					if (Math.abs((rightLength + startRight)-(rightLength + lastRightSpacing)) < 10) {
						if (debug) console.log('skipping short segment');
					} else {
			            segments.push({'segment':segment,'leftLength':leftLength,
			            	'rightLengthStart':(rightLength + startRight),'rightLengthEnd':(rightLength + lastRightSpacing),
			            	'angles':angles});
			            segment++;
					}
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
			if (debug) console.log('newY ' + newY + ' newX ' + newX);

			// console.log('out of letter bounds at ' + newY + ' ' + newX + ' after ' + steps + ' steps');
			endRight = lastRightSpacing;
			if (!isNaN(startRight)) {
				if (debug) console.log('startRight ' + startRight + ' endRight ' + endRight);
				if (debug) console.log('absolute startRight ' + (rightLength + startRight) + ' endRight ' + (rightLength + endRight));
				var angles = getAngleForRightLengths(leftLength,rightLength + startRight,rightLength + lastRightSpacing);
				// var angles = getAngleForRightChange(leftLength,rightLength + startRight,lastRightSpacing);
				// var angles = getAngleForRightChange(leftLength,rightLength + startRight,(rightLength + startRight) - (rightLength + lastRightSpacing));
				if (debug) console.log('angles are ' + JSON.stringify(angles));
	            segments.push({'segment':segment,'leftLength':leftLength,
	            	'rightLengthStart':(rightLength + startRight),'rightLengthEnd':(rightLength + lastRightSpacing),
	            	'angles':angles});
	            segment++;
			}
			if (leftLength < lastLengths.leftLength) leftLength += spacing;
			if (rightLength < lastLengths.rightLength) rightLength += spacing / 4;
		// leftLength += spacing;
		// rightLength += Math.round(spacing * letter.yFactor);
		} else {
			if (debug) console.log('out of x y bounds');
			if (debug) console.log('lastlengths ' + JSON.stringify(lastLengths));
			if (debug) console.log('leftLength ' + leftLength +' rightLength ' + rightLength);
			if (debug) console.log('newX ' + newX + ' newY ' + newY);
			if (debug) console.log('x points '+ letter.points[0].length + ' y points ' + letter.points.length);
			// done!
			break;
			// console.log('breaking');
			var anotherPoint = 0;
			for (var ly=0;ly<letter.points.length;ly++) { 
				for (var lx=0;lx<letter.points[0].length;lx++) {
					if (letter.slicedPoints[ly][lx] != 1) {
						if (debug) console.log('point '+ly +' '+lx+' unsliced');
						var lengths = getLengthsForCoords((lx + firstX) * mmFactor,(ly + firstY) * mmFactor);
						if (debug) console.log('firstY ' + firstY + ' firstX ' + firstX);
						if (debug) console.log('got coord lengths ' + JSON.stringify(lengths));
						if (debug) console.log('leftLength ' + leftLength + ' rightLength ' + rightLength);
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
	if (debug) {
		console.log('done processing letter is ' + JSON.stringify(letter));
	}
	slicedLetter.segments = segments;
	return slicedLetter;
}
function smoothArea(pattern,dest,destX,destY,destLength) {
	if (debug) console.log('destX ' + destX + ' destY ' + destY);
	if (debug) console.log('dest length X ' + dest[0].length + ' Y ' + dest.length + ' destLength param ' + destLength);
	var destScale = Math.round(destLength/pattern.length);
	if (pattern.length == destLength) {
		if (debug) console.log('at terminal depth');
		for (var subx=0;subx<pattern.length;subx++) {
			for (var suby=0;suby<pattern.length;suby++) {
				dest[destY+suby][destX+subx] = (pattern[suby][subx]==0)?0:1;
			}
		}		
		return;
	}
	for (var subx=0;subx<pattern.length;subx++) {
		for (var suby=0;suby<pattern.length;suby++) {
			if (pattern[subx][suby] == 2) {
				// recursively apply
				if (debug) console.log('recursing');
				smoothArea(pattern,dest,destX+(subx*destScale),destY+(suby*destScale),Math.round(destLength/2));
				if (debug) console.log('back from recursing');
				if (debug) console.log('now dest length X ' + dest[0].length + ' Y ' + dest.length + ' destLength param ' + destLength);
			} else {
				let startX = (subx==0)?destX:Math.round(destLength/2);
				let endX = (subx==0)?Math.round(destLength/2):destLength;
				let startY = (suby==0)?destY:Math.round(destLength/2);
				let endY = (suby==0)?Math.round(destLength/2):destLength;
				if (debug) console.log('startX ' + startX + ' endX ' + endX + ' startY ' + startY + ' endY '+ endY);
				for (var sx=startX;sx<endX;sx++) {
					for (var sy=startY;sy<endY;sy++) {
						dest[sy][sx]=(pattern[suby][subx]==0)?0:1;
						if (debug) console.log('adding smoothed val');
					}
				}
			}
		}
	}
}
function scaleLetter(letter) {
	if (debug) {
		console.log('scaling letter ' + JSON.stringify(letter));
	}
	if (debug) console.log('scaling by ' + scale);
	if (scale == 1) {
		var returnLetter = {};
		returnLetter.points = letter.points.slice(0);
		returnLetter.slicedPoints = new Array(letter.height).fill({}).map(()=>new Array(letter.width).fill(0));
		return returnLetter;
	} else {
		var smoothing = new Array(letter.height).fill({}).map(()=>new Array(letter.width).fill({}));
		if (letter.smoothing) {
			for (var s = 0; s < letter.smoothing.length;s++) {
				let stype = letter.smoothing[s].type;
				if (debug) console.log("this letter uses smoothing " + stype);
				let sti =0;
				let found = false;
				let smoothingType = letters.smoothing[stype];
				if (debug) console.log('found this smoothing type');
				if (smoothingType != null) {
					if (debug) console.log('looking for points using this smoothing');
					if (debug) console.log('points are ' + JSON.stringify(letter.smoothing[s].points));
					for (sp of letter.smoothing[s].points) {
						smoothing[sp.Y][sp.X] = smoothingType;
					}
				}
			}
		}
		if (debug) console.log('smoothing is ' + JSON.stringify(smoothing));
		var returnLetter = {"width": Math.round(letter.width * scale),
							"height": Math.round(letter.height * scale)};
		returnLetter.points = new Array(letter.height * scale).fill(0).map(() => new Array(letter.width * scale).fill(0));
		returnLetter.slicedPoints = new Array(letter.height * scale).fill(0).map(() => new Array(letter.width * scale).fill(0));
		if (debug) {
			console.log('returnLetter is ' + JSON.stringify(returnLetter));
		}
		var iv = 0;
		var jv = 0;
		for (var i = 0; i < letter.height; i++) {
			var iv = (i == 0)?0:i*scale;
			for (var j = 0; j < letter.width; j++) {
				var jv = (j == 0)?0:j*scale;
				if (Object.keys(smoothing[i][j]).length > 0) {
					if (debug) console.log('smoothable point');
					var smoothed = new Array(scale).fill(0).map(()=>new Array(scale).fill(0));
					if (debug) console.log('smoothed x ' + smoothed[0].length + ' y ' + smoothed.length);
					var s = smoothing[i][j];
					if (debug) console.log('subx ends ' + s[0].length + ' suby ends ' + s.length);

					// smoothArea(s,smoothed,0,0,scale);
					for (var subx=0;subx<s[0].length;subx++) {
						for (var suby=0;suby<s.length;suby++) {
							if (s[subx][suby] == 3) {
								// recursively apply
								if (debug) console.log('recursing');
							} else {
								let startX = (subx==0)?0:Math.round(scale/2);
								let endX = (subx==0)?Math.round(scale/2):scale;
								let startY = (suby==0)?0:Math.round(scale/2);
								let endY = (suby==0)?Math.round(scale/2):scale;
								if (debug) console.log('startX ' + startX + ' endX ' + endX + ' startY ' + startY + ' endY '+ endY);
								for (var sx=startX;sx<endX;sx++) {
									for (var sy=startY;sy<endY;sy++) {
										smoothed[sy][sx]=(s[subx][suby]==0)?0:1;
										if (debug) console.log('adding smoothed val');
									}
								}
							}
						}
					}

					for (v = 0; v < scale; v++) {
						for (w = 0; w < scale; w++) {
							returnLetter.points[iv + v][jv + w] = smoothed[w][v];
						}
					}
				} else {
					for (v = 0; v < scale; v++) {
						for (w = 0; w < scale; w++) {
							returnLetter.points[iv + v][jv + w] = letter.points[i][j];
						}
					}
				}
			}
		}
	}
	if (debug) console.log('returning ' + JSON.stringify(returnLetter));
	return returnLetter;
}

function outputPreviewHeader() {
	previewWriteStream.write('<html>','ascii');
previewWriteStream.write('<head>\r\n','ascii');
previewWriteStream.write('</head>\r\n','ascii');
previewWriteStream.write('<body bgcolor="#ffffff">\r\n','ascii');
previewWriteStream.write('<canvas id="myCanvas" width="' + (canvasWidth * 2) + '" height="' + canvasHeight + '" style="border:1px solid #d3d3d3;">\r\n','ascii');
previewWriteStream.write('Your browser does not support the HTML5 canvas tag.</canvas>\r\n','ascii');
previewWriteStream.write('<script>\r\n','ascii');
previewWriteStream.write('var c = document.getElementById("myCanvas");\r\n','ascii');

previewWriteStream.write('var segments=[\r\n','ascii');
}
function outputPreviewFooter() {
	previewWriteStream.write('];\r\n','ascii');
previewWriteStream.write('var ctx = c.getContext("2d");\r\n','ascii');
previewWriteStream.write('ctx.beginPath();\r\n','ascii');
previewWriteStream.write('var seg;\r\n','ascii');
previewWriteStream.write('while (seg = segments.shift()) {\r\n','ascii');
previewWriteStream.write('console.log(\'drawing segment for \' + JSON.stringify(seg));\r\n','ascii');
previewWriteStream.write('if (seg.angles) {\r\n','ascii');
previewWriteStream.write('ctx.beginPath();\r\n','ascii');
previewWriteStream.write('ctx.arc(0,0,(seg.leftLength/5),seg.angles.origRadianAngle,seg.angles.finalRadianAngle);\r\n','ascii');
previewWriteStream.write('ctx.stroke();\r\n','ascii');
previewWriteStream.write('} else {	\r\n','ascii');
previewWriteStream.write('ctx.moveTo((seg.leftLength/5)-300,(seg.rightLengthStart / 5)-300);\r\n','ascii');
previewWriteStream.write('ctx.lineTo((seg.leftLength / 5)-300,(seg.rightLengthEnd / 5)-300);\r\n','ascii');
previewWriteStream.write('ctx.stroke();\r\n','ascii');
previewWriteStream.write('}\r\n','ascii');
previewWriteStream.write('}\r\n','ascii');
previewWriteStream.write('ctx.stroke();\r\n','ascii');
previewWriteStream.write('</script>\r\n','ascii');
previewWriteStream.write('</body>\r\n','ascii');
previewWriteStream.write('</html>\r\n','ascii');
}