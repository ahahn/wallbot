const repl = require('repl');
const fs = require('fs');
const config = require('./config.json');
const letters = require('./letters.js');
const SerialPort = require('serialport')
const Readline = SerialPort.parsers.Readline
const due = '/dev/cu.usbserial-A9007RfU'
const uno = '/dev/cu.usbmodem1421'
const port = new SerialPort(config.port, {
	baudRate:19200
});
const parser = new Readline();
const replServer = repl.start({ prompt: '> '});
var commandList = [];

var previewWriteStream;
var scale = 8;
var spacing = 10;

const mmFactor = 2;
var scaleFactor = 2;

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

var rightLength = Math.round(Math.sqrt(Math.pow(canvasWidth / 2, 2)+Math.pow(canvasHeight/2, 2))) + 10;
var leftLength = Math.round(Math.sqrt(Math.pow(canvasWidth / 2, 2)+Math.pow(canvasHeight /2, 2))) + 10;
// var rightLength = Math.round(Math.sqrt(Math.pow(canvasWidth * mmFactor / 2, 2)+Math.pow(canvasHeight * mmFactor /2, 2)));
// var leftLength = Math.round(Math.sqrt(Math.pow(canvasWidth * mmFactor / 2, 2)+Math.pow(canvasHeight * mmFactor /2, 2)));

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
		console.log('leftLength ' + leftLength + ' rightLength ' + rightLength);
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
		} else {
			console.log('unknown font ' + f);
		}
	}
});
replServer.defineCommand('origin',{
	help: 'Return to origin',
	action() {
		sendCommand("o");
		rightLength = Math.round(Math.sqrt(Math.pow(canvasWidth / 2, 2)+Math.pow(canvasHeight/2, 2))) + 10;
		leftLength = Math.round(Math.sqrt(Math.pow(canvasWidth / 2, 2)+Math.pow(canvasHeight /2, 2))) + 10;
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
replServer.defineCommand('coords',{
	help: 'Report coordinates of specified <left> <right> lengths',
	action(lengths) {
		console.log('read lengths '+lengths+ ' canvasWidth ' + canvasWidth);
		var c = lengths.match(/-?\d+/g).map(Number);
		console.log('left ',c[0]);
		console.log('right ',c[1]);
		var coords = getCoordsForLengths(c[0],c[1]);
		console.log('got coords ' + JSON.stringify(coords));
		var l = getLengthsForCoords(coords.X,coords.Y);
		console.log('got lengths ' + JSON.stringify(l));
	}
});
replServer.defineCommand('lengths',{
	help: 'Report lengths of specified <left> <right> coordinates',
	action(coords) {
		console.log('read coords '+coords+ ' canvasWidth ' + canvasWidth);
		var c = coords.match(/-?\d+/g).map(Number);
		console.log('X ',c[0]);
		console.log('Y ',c[1]);
		var lengths = getLengthsForCoords(c[0],c[1]);
		console.log('got lengths ' + JSON.stringify(lengths));
		var coords = getCoordsForLengths(lengths.leftLength,lengths.rightLength);
		console.log('got coords ' + JSON.stringify(coords));
	}
});
replServer.defineCommand('canvas',{
	help: 'Define new canvas size in mm <x> <y>',
	action(sizes) {
		if (sizes.trim().length == 0) {
			console.log('usage: canvas <width in mm> <height in mm>');
			return;
		}
		console.log('read sizes ',sizes);
		var m = sizes.match(/-?\d+/g);
		if (m == null) {
			console.log('usage: canvas <width in mm> <height in mm>');
			return;
		}
		var c = m.map(Number);
		if (c.length != 2) {
			console.log('usage: canvas <width in mm> <height in mm>');
			return;
		}
		console.log('X ',c[0]);
		console.log('Y ',c[1]);
		canvasWidth = c[0];
		canvasHeight = c[1];
		sendCommand('c ' + c[0] +' ' + c[1]);
		curX = Math.round(canvasWidth/2);
		curY = Math.round(canvasHeight/2);
		rightLength = Math.round(Math.sqrt(Math.pow(canvasWidth/ 2, 2)+Math.pow(canvasHeight/2, 2))) + 10;
		leftLength = Math.round(Math.sqrt(Math.pow(canvasWidth / 2, 2)+Math.pow(canvasHeight /2, 2))) + 10;
		var l = getLengthsForCoords(canvasWidth/2,canvasHeight/2);
		console.log('formulaic lengths ' + JSON.stringify(l));
		// rightLength = Math.round(Math.sqrt(Math.pow(canvasWidth * mmFactor / 2, 2)+Math.pow(canvasHeight * mmFactor /2, 2)));
		// leftLength = Math.round(Math.sqrt(Math.pow(canvasWidth * mmFactor / 2, 2)+Math.pow(canvasHeight * mmFactor /2, 2)));
		console.log('leftLength ' + leftLength + ' rightLength ' + rightLength);
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
		if (scaleParam.trim().length > 0) {
			console.log('read scale',scaleParam);
			var c = scaleParam.match(/-?\d+/g).map(Number);
			scale = c[0];
			console.log('scale now ' + scale);
		}
	}
});
replServer.defineCommand('scalefactor',{
	help: 'Set overall scaling',
	action(scaleParam) {
		if (scaleParam.trim().length > 0) {
			console.log('read scalefactor',scaleParam);
			var c = scaleParam.match(/-?\d+/g).map(Number);
			scaleFactor = c[0];
			console.log('scalefactor now ' + scaleFactor);
		}
	}
});
replServer.defineCommand('spacing',{
	help: 'Set spacing for block letters',
	action(spacingParam) {
		if (spacingParam.trim().length > 0) {
			console.log('read spacing ',spacingParam);
			var c = spacingParam.match(/-?\d+/g).map(Number);
			spacing = c[0];
			console.log('spacing now ' + spacing);
		}
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
		console.log('Canvas width ' + canvasWidth + ' height ' + canvasHeight);
		console.log('Lengths Left ' + leftLength + ' Right ' + rightLength);
		console.log('Coords X ' + curX + ' Y ' + curY);
		console.log('Test:',test);
		console.log('Debug:',debug);
		console.log('Font:',font);
		console.log('Scale:',scale);
		console.log('Scale Factor:',scaleFactor);
		console.log('Spacing:',spacing);
		console.log('Lift:',lift);
		console.log('Lift gap:',liftGap);
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
			console.log('curX ' + curX + ' curY ' + curY);
			var first = true;
			var letterX = curX;
			var letterY = curY;
			// var letterX = curX * mmFactor;
			// var letterY = curY * mmFactor;
			var control = false;
			var maxHeight = -1;
			var bottomLengths = null;
			var plannedLeftLength = leftLength;
			var plannedRightLength = rightLength;
			for (let i = 0; i < message.length; i++) {
				let j = 0;
				console.log('writing :' + message[i] + ':');
				if (message[i] == ' ') {
					commandList.push('g ' + (letters[font].spaceWidth * scale) + ' 0');
					letterX += (letters[font].spaceWidth * scale);
					continue;
				} else if (message[i] == '\\') {
					control = true;
					continue;
				} else if (control) {
					if (message[i] == 'r') {
						console.log('got slash-r');

						// console.log('maxHeight is ' + maxHeight + ' curX ' + curX + ' letterX ' + letterX);
						var xDiff = curX - (letterX);
						var yDiff = (maxHeight + 3) * scale;
						console.log('xDiff ' + xDiff + ' yDiff ' + yDiff);
						// commandList.push('g ' + xDiff + ' ' + yDiff);
						letterX += xDiff;
						letterY += yDiff;

						if (bottomLengths != null) {
							var rDiff = rightLength - bottomLengths.rightLength;
							var lDiff = leftLength - bottomLengths.leftLength;
							console.log('rDiff ' + rDiff + ' lDiff ' + lDiff);
							commandList.push('r ' + rDiff);
							plannedRightLength += rDiff;
							commandList.push('l ' + lDiff);
							plannedLeftLength += lDiff;
						}
						first = true;
						bottomLengths = null;
						maxHeight = -1;
					}
					control = false;
					continue;
				}
				control = false;
				let l = letters[font][message[i]];
				if (debug) console.log('letter is ' + JSON.stringify(l));
				if ((l) && (Object.keys(l).length > 0)) {
					console.log('writing ' + message[i]);
					if (l.height > maxHeight) maxHeight = l.height;
					if (letters[font].style=='line') {
						if (!first) {
							// make space
							commandList.push('g ' + (2 * scale) + ' 0');
							letterX += (2 * scale);
						}
						writeLineLetter(l);
					} else if (letters[font].style=='block') {
						if (!first) {
							// make space
							commandList.push('g ' + (3 * scale) + ' 0');
							letterX += (3 * scale);
						}
						var lengths = getLengthsForCoords(letterX,letterY);
						console.log('letterX ' + letterX + ' letterY ' + letterY + ' got lengths ' + JSON.stringify(lengths));
						console.log('planned lengths left ' + plannedLeftLength + ' right ' + plannedRightLength);
						var doneLengths = writeBlockLetter(l,lengths.leftLength,lengths.rightLength);
						plannedLeftLength = doneLengths.leftLength;
						plannedRightLength = doneLengths.rightLength;
						console.log('letter bottomLengths ' + JSON.stringify(l.bottomLengths));
						if (bottomLengths == null) {
							bottomLengths = l.bottomLengths;
						}
						letterX += (l.width * scale);
						console.log('done writing letter ' + message[i] + ' doneLengths ' + JSON.stringify(doneLengths) + ' letterX ' + letterX + ' letterY ' + letterY);
					}
					first = false;
				} else {
					console.log('couldn\'t find letter ' + message[i]);
				}
			}
			outputPreviewFooter();
			previewWriteStream.end();
			if (commandList.length > 0) {
				if (test) {
					while (commandList.length > 0) {
						sendCommand(commandList.shift());
					}
				} else {
					sendCommand(commandList.shift());
				}
			}
		} else {
			console.log('Usage: write <string>');
		}

	}
});
function writeBlockLetter(letter,leftLength,rightLength) {
	console.log('slicing letter ' + JSON.stringify(letter) + ' font ' + font);
	console.log('leftLength ' + leftLength + ' rightLength ' + rightLength);
	console.log('got scale ' + scale + ' spacing ' + spacing);

	var coords = getCoordsForLengths(leftLength,rightLength);
	console.log('coords ' + JSON.stringify(coords));
	// curX = Math.abs(Math.round(coords.X / mmFactor));
	// curY = Math.abs(Math.round(coords.Y / mmFactor));
	var startLeft = leftLength;
	var startRight = rightLength;
	var doneLengths = {leftLength: leftLength,rightLength:rightLength};
	var slicedLetter = sliceLetter(letter,leftLength,rightLength);
	if (slicedLetter.doneLengths) {
		console.log('back from sliceLetter, doneLengths ' + JSON.stringify(slicedLetter.doneLengths));
		doneLengths = slicedLetter.doneLengths;
	}
	if (debug) console.log('calling optimizePaths');
	slicedLetter.finalSegments = optimizePaths(slicedLetter.segments);
	if (debug) console.log('back from optimizePaths');

	leftLength = startLeft;
	rightLength = startRight;
	var actualLengths;
	if (unidirectional) {
		actualLengths = drawSegmentsUnidirectional(letter,slicedLetter,leftLength,rightLength);
	} else {
		console.log('drawing segments from letter ' + JSON.stringify(letter) + ' font ' + font);
		actualLengths = drawSegments(letter,slicedLetter,leftLength,rightLength);
	}
	console.log('doneLengths ' + JSON.stringify(doneLengths) + ' actualLengths ' + JSON.stringify(actualLengths));
	sendNextCommand();
	return doneLengths;
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
	if (segments.length == 0) return finalPaths;
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
			if (debug)
			console.log('duplicates ' + duplicates.length);
			var removed = 0;
			for (var dup of duplicates) {
				if ((dup - removed) < shortestIndex) shortestIndex--;
				var s = segments.splice(dup - removed,1);
				removed++;
				if (debug)
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
	var startCoords = getCoordsForLengths(leftLength,rightLength);
	// var startCoords = getCoordsForLeftChange(rightLength,leftLength,0);
	while (seg = segments.shift()) {
		previewWriteStream.write(JSON.stringify(seg) + ',\r\n', 'ascii');
		commandList.push('# ' + JSON.stringify(seg));
		if (debug) console.log(seg);
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
			if (debug) console.log(c);
			commandList.push(c);
			curLeft += (seg.leftLength - curLeft);
		}
		if (startRight != curRight) {
			c = "r " + rightShift;
			if (debug) console.log(c);
			commandList.push(c);
			curRight += rightShift;
		}
		if (penUp) {
			commandList.push("d");
			penUp = false;
		}
		c = "r " + (endRight - curRight);
		if (debug) console.log(c);
		commandList.push(c);
		curRight += (endRight - curRight);

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
	}
	commandList.push('p');
	console.log('end curLeft ' + curLeft + ' curRight ' + curRight);
	console.log('doneLengths ' + JSON.stringify(slicedLetter.doneLengths))
	var leftDiff = slicedLetter.doneLengths.leftLength - curLeft;
	var rightDiff = slicedLetter.doneLengths.rightLength - curRight;
	console.log('leftDiff ' + leftDiff + ' rightDiff ' + rightDiff);
	commandList.push('r ' + rightDiff);
	curRight += rightDiff;
	commandList.push('l ' + leftDiff);
	curLeft += leftDiff;
	// var endCoords = getCoordsForLeftChange(curRight,curLeft,0);
	// var targetX = startCoords.X + ((letter.width * scale) * mmFactor);
	// console.log('startcoords ' + JSON.stringify(startCoords) + ' endcoords ' + JSON.stringify(endCoords) + ' diff Y ' + (startCoords.Y - endCoords.Y) + ' X ' + (targetX - endCoords.X) + ' tagetX ' + targetX);
	// if ((startCoords.Y != endCoords.Y)||(endCoords.X != targetX)) {
	// 	commandList.push('g ' + (targetX - endCoords.X) +' ' + (startCoords.Y - endCoords.Y));
	// }
	commandList.push('p');
	return {"leftLength":curLeft,"rightLength":curRight};
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
	curRight += rightDiff;
	commandList.push('l ' + leftDiff);
	curLeft += leftDiff;
	return {"leftLength":curLeft,"rightLength":curRight};
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
	// rightLength += (steps/mmFactor);
	sendCommand('r ' + steps);
}
function changeLeft(steps) {
	// leftLength += (steps/mmFactor);
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
	if (command.trim().startsWith('r')) {
		var c = command.substring(1).match(/-?\d+/g).map(Number);	
		if (!isNaN(c[0])) {			
			rightLength += c[0]/mmFactor;
			// rightLength += c/mmFactor;
			var coords = getCoordsForLengths(leftLength,rightLength);
			curX = Math.abs(Math.round(coords.X));
			curY = Math.abs(Math.round(coords.Y));
			// curX = Math.abs(Math.round(coords.X / mmFactor));
			// curY = Math.abs(Math.round(coords.Y / mmFactor));
			console.log('coords ' + JSON.stringify(coords) + ' curX ' + curX + ' curY ' + curY + ' leftLength ' + leftLength + ' rightLength ' + rightLength);
		}
	} else 	if (command.trim().startsWith('l')) {
		var c = command.substring(1).match(/-?\d+/g).map(Number);		
		if (!isNaN(c[0]))	{
			leftLength += c[0]/mmFactor;
			// leftLength += c/mmFactor;
			var coords = getCoordsForLengths(leftLength,rightLength);
			curX = Math.abs(Math.round(coords.X));
			curY = Math.abs(Math.round(coords.Y));
			// curX = Math.abs(Math.round(coords.X / mmFactor));
			// curY = Math.abs(Math.round(coords.Y / mmFactor));
			console.log('coords ' + JSON.stringify(coords) + ' curX ' + curX + ' curY ' + curY + ' leftLength ' + leftLength + ' rightLength ' + rightLength);
		}
	} else if (command.trim().startsWith('g')) {
		var c = command.substring(1).match(/-?\d+/g).map(Number);
		console.log('starting at X ' + curX + ' Y ' + curY);
		console.log('moving by X ' + c[0] + ' Y ' + c[1]);	
		var lengths = getLengthsForCoords(curX + c[0],curY + c[1]);
		console.log('got lengths ' + JSON.stringify(lengths));
		leftLength = lengths.leftLength;
		rightLength = lengths.rightLength;
		curX += c[0];
		curY += c[1];
		console.log('ended at X ' + curX + ' Y ' + curY);
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
// var rightLength = Math.round(Math.sqrt(Math.pow(canvasWidth / 2, 2)+Math.pow(canvasHeight/2, 2))) + 10;
// var leftLength = Math.round(Math.sqrt(Math.pow(canvasWidth / 2, 2)+Math.pow(canvasHeight /2, 2))) + 10;
// 52.900 = x2, x=230
// 122.500 = Y2, y=350
	var leftLength = Math.round(Math.sqrt(Math.pow(xSteps,2) + Math.pow(ySteps,2))) + 10;
	var rightLength = Math.round(Math.sqrt(Math.pow((canvasWidth)-xSteps,2) + Math.pow(ySteps,2))) + 10;
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
function getCoordsForLengths(leftVal,rightVal) {
	// console.log('getting coords for lengths left ' + leftRadius + ' right ' + rightRadius + ' canvasWidth ' + canvasWidth);
	// cos(C) = (a^2 + b^2 - c^2)/2ab
	// var leftRadius = leftVal + 10;
	// var rightRadius = rightVal + 10;
	var leftRadius = leftVal - 10;
	var rightRadius = rightVal - 10;
	var squares = Math.pow(leftRadius,2) + Math.pow(canvasWidth ,2) - Math.pow(rightRadius,2);
	if (debug) console.log('squares ' + squares);
	var cosC = (squares / (2 * leftRadius * (canvasWidth)))	;
	// var cosC = (squares / (2 * leftRadius * (canvasWidth * mmFactor)))	;
	if (debug) console.log('cosC ' + cosC);
	var radianAngle = Math.acos(cosC);
	if (isNaN(radianAngle)) {
		console.log('NaN radianAngle for left ' + leftRadius + ' right ' + rightRadius + ' canvasWidth ' + canvasWidth);
	}
	if (debug) {
		console.log('radianAngle ' + radianAngle);
		console.log('degree angle ' + (radianAngle * 180 / Math.PI));
	}
	var x = Math.round(leftRadius * Math.sin(radianAngle + (Math.PI / 2)));
	var y = Math.round(leftRadius * Math.cos(radianAngle + (Math.PI / 2))) * -1;
	return {"X":x,"Y":y};
}
function getAngleForRightLengths(leftRadius,rightRadius,rightRadiusEnd) {
  // var side = rightChange / 2;
  // var angle = Math.asin(side/leftRadius);
  var origSquares = Math.pow(leftRadius,2) + Math.pow(canvasWidth,2) - Math.pow(rightRadius,2);
  var origCosC = origSquares / (2 * leftRadius * (canvasWidth));
  var origRadianAngle = Math.acos(origCosC);
  var squares = Math.pow(leftRadius,2) + Math.pow(canvasWidth,2) - Math.pow(rightRadiusEnd,2);
  var cosC = squares / (2 * leftRadius * (canvasWidth));
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
function sliceLetter(letterParam,leftLength,rightLength) {
	var slicedLetter = {};
	var segments = [];
	var letter = scaleLetter(letterParam);
	console.log('letter X length ' + letter.points[0].length + ' Y length ' + letter.points.length);
	// console.log('letter 0 0 is ' + letter.points[0][0]);
	var startCoords = getCoordsForLengths(leftLength, rightLength);
	var firstX = startCoords.X;
	var firstY = startCoords.Y;
	console.log('first X ' + firstX + ' firstY ' + firstY);
	var letterWidth = letter.points[0].length * scaleFactor;
	var letterHeight = letter.points.length * scaleFactor;
	var lastX = firstX + letterWidth;
	var lastY = firstY + letterHeight;
	// console.log('lastX ' + lastX + ' lastY ' + lastY);
	var doneLengths = getLengthsForCoords(lastX, firstY);
	var bottomLengths = getLengthsForCoords(firstX, lastY);
	// var doneLengths = getLengthsForCoords(lastX * mmFactor, firstY * mmFactor);
	// var bottomLengths = getLengthsForCoords(curX * mmFactor, lastY * mmFactor);
	console.log('doneLengths ' + JSON.stringify(doneLengths));
	slicedLetter.doneLengths = doneLengths;
	letterParam.bottomLengths = bottomLengths;
	var lastLengths = getLengthsForCoords(lastX, lastY);
	if (test) {
		console.log('lastlengths ' + JSON.stringify(lastLengths));
		console.log('leftLength ' + leftLength +' rightLength ' + rightLength);
	}
	var lastLeftAdjustment = 0;

	var segment = 0;
	var segmentCoords = {};
	while (leftLength <= lastLengths.leftLength) {
		var newCoords = getCoordsForLengths(leftLength, rightLength);
		if (debug) console.log('looping with coords ' + JSON.stringify(newCoords));
		// var newCoords = getCoordsForRightChange(leftLength, rightLength,0);
		var newX = Math.abs(Math.round(newCoords.X)) - Math.abs(firstX);
		var newY = Math.abs(Math.round(newCoords.Y)) - Math.abs(firstY);
		if (debug) console.log('newX ' + newX + ' newY ' + newY);
		var changes = 0;
		var rightChanges = false;
		while ((changes < 10)&& ((newY < 0)||(newY >= letterHeight))) {
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
				if (newY >= letterHeight) {
					rightChanges = true;
					rightLength -= spacing / 4;
					if (debug)
					console.log('decreased rightLength to ' + rightLength);
				}
			}
			newCoords = getCoordsForLengths(leftLength, rightLength);
			// newCoords = getCoordsForRightChange(leftLength, rightLength,0);
			newX = Math.abs(Math.round(newCoords.X )) - Math.abs(firstX);
			newY = Math.abs(Math.round(newCoords.Y )) - Math.abs(firstY);
			if (debug)
			console.log('adjusted newX ' + newX + ' newY ' + newY);
		}
		if (changes >= 10) {
			console.log('gave up looking right after ' + changes + ' tries');
		}
		changes = 0;
		while ((!rightChanges)&&(changes < 10)&& ((newX < 0)||(newX >= letterWidth))) {
			changes++;
			// if (lastLeftAdjustment == leftLength) break;
			lastLeftAdjustment = leftLength;
			if (debug)
			console.log('adjusting from newX ' + newX + ' newY ' + newY);
			if (rightLength <= lastLengths.rightLength) {
				if (newX < 0) {
					leftLength += spacing;
					if (debug)
					console.log('increased leftLength to ' + leftLength);
				}
				if (newX >= letterWidth) {
					leftLength -= spacing;
					if (debug)
					console.log('decreased leftLength to ' + leftLength);
				}
			}
			newCoords = getCoordsForLengths(leftLength, rightLength);
			// newCoords = getCoordsForRightChange(leftLength, rightLength,0);
			newX = Math.abs(Math.round(newCoords.X )) - Math.abs(firstX);
			newY = Math.abs(Math.round(newCoords.Y )) - Math.abs(firstY);
			if (debug)
			console.log('adjusted newX ' + newX + ' newY ' + newY);
		}
		if (changes >= 10) {
			console.log('gave up looking left after ' + changes + ' tries');
		}
		// console.log('checking for coords ' + Math.round(newCoords.X/mmFactor) + ' ' + Math.round(newCoords.Y/mmFactor) + ' (letter ' + newX + ' ' + newY + ')');
		if ((newX >= 0) &&(newX < letterWidth) && (newY >= 0) && (newY < letterHeight)) {
			if (debug) console.log('processing Y ' + newY + ' X ' + newX);
			// still within bounds for this letter
			var lastRightSpacing = 0;
			var rightSpacing = 0;
			var startRight = NaN;
			var endRight = NaN;
			// var startRight = 0;
			// var endRight = 0;
			// console.log('backing out to top');
			var steps = 0;
			while ((newX >= 0) &&(newX < letterWidth) && (newY >= 0) && (newY < letterHeight)) {
				steps++;
				lastRightSpacing = rightSpacing;
				rightSpacing = rightSpacing - 5;
				newCoords = getCoordsForLengths(leftLength, rightLength + rightSpacing);
				console.log('leftLength ' + leftLength + ' rightLength ' + rightLength + ' rightSpacing ' + rightSpacing + ' newCoords ' + JSON.stringify(newCoords) + ' newX ' + (Math.abs(Math.round(newCoords.X )) - Math.abs(firstX)) + ' newY ' + (Math.abs(Math.round(newCoords.Y )) - Math.abs(firstY)));
				// newCoords = getCoordsForRightChange(leftLength, rightLength,rightSpacing);
				newX = Math.abs(Math.round(newCoords.X )) - Math.abs(firstX);
				newY = Math.abs(Math.round(newCoords.Y )) - Math.abs(firstY);
			}
			// console.log('out of letter bounds at ' + newY + ' ' + newX + ' after ' + steps + ' steps');
			// reset to last point within bounds
			newCoords = getCoordsForLengths(leftLength, rightLength + lastRightSpacing);
			// newCoords = getCoordsForRightChange(leftLength, rightLength,lastRightSpacing);
			newX = Math.abs(Math.round(newCoords.X )) - Math.abs(firstX);
			newY = Math.abs(Math.round(newCoords.Y )) - Math.abs(firstY);
			if (steps > 0) {
				console.log('adjusted right to ' + lastRightSpacing + ' newX ' + newX + ' newY ' + newY);
			}
			// startRight = lastRightSpacing;
			// console.log('point ' + newY + ' ' + newX + ' is ' + letter.points[newY][newX]);
			if (letter.points[Math.trunc(newY/scaleFactor)][Math.trunc(newX/scaleFactor)] === 1) {
				// console.log('setting startright');
				segmentCoords.start = {X:Math.trunc(newX/scaleFactor),Y:Math.trunc(newY/scaleFactor)};
	            // if (debug) console.log('Segment starts in location X ' + Math.trunc(newX/scaleFactor) + ' Y ' + Math.trunc(newY/scaleFactor));
				startRight = lastRightSpacing;
			}
			// console.log('walking to bottom');
			steps = 0;
			while ((newX >= 0) &&(newX < letterWidth) && (newY >= 0) && (newY < letterHeight)) {
				steps++;
				letter.slicedPoints[Math.trunc(newY/scaleFactor)][Math.trunc(newX/scaleFactor)] = 1;
				// letter.slicedPoints[newY][newX] = 1;
		        // console.log('newY ' + newY + ' newX ' + newX + ' marked sliced');
		        if (letter.points[Math.trunc(newY/scaleFactor)][Math.trunc(newX/scaleFactor)] === 1) {
		          if (isNaN(startRight)) {
		            // console.log('setting startRight at ' + newY + ' ' + newX);
		            // if (debug) console.log('segment starts in location X ' + Math.trunc(newX/scaleFactor) + ' Y ' + Math.trunc(newY/scaleFactor));
					console.log('found segment to draw with right ' + lastRightSpacing + ' newX ' + newX + ' newY ' + newY);
					segmentCoords.start = {X:Math.trunc(newX/scaleFactor),Y:Math.trunc(newY/scaleFactor)};
					if (debug) console.log('setting startRight to ' + lastRightSpacing);
		            startRight = lastRightSpacing;
		          }
		        } else {
		          if (!isNaN(startRight)) {
		            if (debug) console.log('got to end of segment');
		            if (debug) console.log('startRight ' + startRight + ' end of segment ' + lastRightSpacing);
		            if (debug) console.log('absolute startRight ' + (rightLength + startRight) + ' end of segment ' + (rightLength + lastRightSpacing));
					var angles = getAngleForRightLengths(leftLength,rightLength + startRight,rightLength + lastRightSpacing);
					// var angles = getAngleForRightChange(leftLength,rightLength + startRight,lastRightSpacing);
					// var angles = getAngleForRightChange(leftLength,rightLength + startRight,(rightLength + startRight) - (rightLength + lastRightSpacing));
					if (Math.abs((rightLength + startRight)-(rightLength + lastRightSpacing)) < 10) {
						if (debug) console.log('skipping short segment');
					} else {
			            if (debug) {
			            	var cLength = Math.sqrt(Math.pow(Math.trunc(newX/scaleFactor)-segmentCoords.start.X,2)+Math.pow(Math.trunc(newY/scaleFactor)-segmentCoords.start.Y,2));
			            	console.log('segment ' + segments.length + ' coords ' + JSON.stringify(segmentCoords.start) + ' X ' + Math.trunc(newX/scaleFactor) + ' Y ' + Math.trunc(newY/scaleFactor) + ' length ' + cLength);
			            }
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
				newCoords = getCoordsForLengths(leftLength, rightLength + rightSpacing);
				// newCoords = getCoordsForRightChange(leftLength, rightLength,rightSpacing);
				newX = Math.abs(Math.round(newCoords.X )) - Math.abs(firstX);
				newY = Math.abs(Math.round(newCoords.Y )) - Math.abs(firstY);
			}
			// reset to last point within bounds
			newCoords = getCoordsForLengths(leftLength, rightLength + lastRightSpacing);
			// newCoords = getCoordsForRightChange(leftLength, rightLength,lastRightSpacing);
			newX = Math.abs(Math.round(newCoords.X )) - Math.abs(firstX);
			newY = Math.abs(Math.round(newCoords.Y )) - Math.abs(firstY);
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
	            if (debug) {
	            	var cLength = Math.sqrt(Math.pow(Math.trunc(newX/scaleFactor)-segmentCoords.start.X,2)+Math.pow(Math.trunc(newY/scaleFactor)-segmentCoords.start.Y,2));
	            	console.log('segment ' + segments.length + ' coords ' + JSON.stringify(segmentCoords.start) + ' X ' + Math.trunc(newX/scaleFactor) + ' Y ' + Math.trunc(newY/scaleFactor) + ' length ' + cLength);
	            }
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
			if (debug) console.log('letterWidth ' + letterWidth + ' letterHeight ' + letterHeight);
			if (debug) console.log('x points '+ letter.points[0].length + ' y points ' + letter.points.length);
			// done!
			break;
			// console.log('breaking');
			var anotherPoint = 0;
			for (var ly=0;ly<letterHeight;ly++) { 
				for (var lx=0;lx<letterWidth.length;lx++) {
					if (letter.slicedPoints[Math.trunc(ly/scaleFactor)][Math.trunc(lx/scaleFactor)] != 1) {
					// if (letter.slicedPoints[ly][lx] != 1) {
						if (debug) console.log('point '+ly +' '+lx+' unsliced');
						var lengths = getLengthsForCoords((lx + firstX) ,(ly + firstY));
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
						if (debug) console.log('got another point, breaking');
						break;
					}
			}
			// console.log('second break');
			if (anotherPoint === 0) {
				if (debug) console.log('no more points, breaking');
				break;
			}
		}
	}
	console.log('done letter, lenghts left ' + leftLength + ' right ' + rightLength);
	// slicedLetter.doneLengths = {leftLength:leftLength,rightLength:rightLength};
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
		// returnLetter.slicedPoints = new Array(letter.height * scaleFactor).fill({}).map(()=>new Array(letter.width * scaleFactor).fill(0));
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
		// returnLetter.slicedPoints = new Array(letter.height * scale * scaleFactor).fill(0).map(() => new Array(letter.width * scale * scaleFactor).fill(0));
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
previewWriteStream.write('<canvas id="myCanvas" width="' + (canvasWidth * 4) + '" height="' + (canvasHeight * 2) + '" style="border:1px solid #d3d3d3;">\r\n','ascii');
previewWriteStream.write('Your browser does not support the HTML5 canvas tag.</canvas>\r\n','ascii');
previewWriteStream.write('<script>\r\n','ascii');
previewWriteStream.write('var c = document.getElementById("myCanvas");\r\n','ascii');

previewWriteStream.write('var segments=[\r\n','ascii');
}
function outputPreviewFooter() {
	previewWriteStream.write('];\r\n','ascii');
previewWriteStream.write('var ctx = c.getContext("2d");\r\n','ascii');
previewWriteStream.write('var seg;\r\n','ascii');
previewWriteStream.write('while (seg = segments.shift()) {\r\n','ascii');
previewWriteStream.write('ctx.beginPath();\r\n','ascii');
previewWriteStream.write('console.log(\'drawing segment for \' + JSON.stringify(seg));\r\n','ascii');
previewWriteStream.write('if (seg.angles1) {\r\n','ascii');
previewWriteStream.write('ctx.beginPath();\r\n','ascii');
previewWriteStream.write('ctx.arc(0,0,(seg.leftLength/5),seg.angles.origRadianAngle,seg.angles.finalRadianAngle);\r\n','ascii');
previewWriteStream.write('ctx.stroke();\r\n','ascii');
previewWriteStream.write('} else {	\r\n','ascii');
previewWriteStream.write('ctx.moveTo((seg.leftLength),(seg.rightLengthStart));\r\n','ascii');
previewWriteStream.write('ctx.lineTo((seg.leftLength),(seg.rightLengthEnd));\r\n','ascii');
previewWriteStream.write('if (seg.style) {\r\n','ascii');
previewWriteStream.write('ctx.strokeStyle = seg.style;\r\n','ascii');
previewWriteStream.write('} else {\r\n','ascii');
previewWriteStream.write('ctx.strokeStyle = \'black\';\r\n','ascii');
previewWriteStream.write('}\r\n','ascii');
previewWriteStream.write('ctx.stroke();\r\n','ascii');
previewWriteStream.write('}\r\n','ascii');
previewWriteStream.write('ctx.closePath();\r\n','ascii');
previewWriteStream.write('}\r\n','ascii');
previewWriteStream.write('ctx.stroke();\r\n','ascii');
previewWriteStream.write('</script>\r\n','ascii');
previewWriteStream.write('</body>\r\n','ascii');
previewWriteStream.write('</html>\r\n','ascii');
}
