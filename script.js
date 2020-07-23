// GRAB EXTERNAL STUFF WE NEED
const slp = require('@slippi/slippi-js');
const SlippiGame = slp.default;
const fs = require('fs');
const path = require('path');

// -- COMBO FINDING VARIABLES --

// make sure folders exist before running script
const replay_path = "replays";
const output_path_and_filename = "clipShows/moments";
const using_absolute_paths = false; // absolute path would be something like "D:/schmoo/replays"

// times are in frames (60 frames in a second)
const skipCPUmatches = false;
const minimumGameTime = 1200; // 20 seconds

const captureTimePreInput = 600; // 10 seconds
const captureTimePostInput = 60; // 1 second
const captureLockoutTime = 300; // 5 seconds

const limitCharacters = false;

// possible characters: "Captain Falcon", "Donkey Kong", "Fox", "Mr. Game & Watch", "Kirby", "Bowser", "Link", "Luigi", "Mario", "Marth", "Mewtwo", "Ness", "Peach", "Pikachu", "Ice Climbers", "Jigglypuff", "Samus", "Yoshi", "Zelda", "Sheik", "Falco", "Young Link", "Dr. Mario", "Roy", "Pichu", "Ganondorf"
const acceptableCharacters = ["Fox"];

// the input it looks for to find moments. 
// possible inputs: "A", "B", "X", "Y", "Z", "L", "R", "Start", "DpadRight", "DpadLeft", "DpadUp", "DpadDown"
// these are case sensitive

const captureInputCommand = ["L", "R", "Z"];

// -- COMBO FINDING VARIABLES END --

// -- MELEE CONSTANTS --

const Button = {
  none : 0x0000,
  dpadLeft : 0x0001,
  dpadRight : 0x0002,
  dpadDown : 0x0004,
  dpadUp : 0x0008,
  z : 0x0010,
  r : 0x0020,
  l : 0x0040,
  a : 0x0100,
  b : 0x0200,
  x : 0x0400,
  y : 0x0800,
  start : 0x1000
}

// -- MELEE CONSTANTS END --

// ------- BIG BOI CODE --------

// Setting up a few useful functions

function GetCharName (players, p) {
  var char_name = "";
  for (var m=0;m<players.length;m++) {
    if (players[m].playerIndex == p) {
      if (players[m].characterId > 25) {
        char_name = "Special";
      }
      else {
        char_name = slp.characters.getCharacterName(players[m].characterId);
      }
      break;
    }
  }
  return char_name;
}

function CharIsAcceptable(players, p) {
  if (!limitCharacters) return true;
  return _CharIsAcceptable(GetCharName(players, p));
}

function _CharIsAcceptable(character) {
  for (var i=0;i<acceptableCharacters.length;i++) {
    if (acceptableCharacters[i] == character) return true;
  }
  return false;
}

function GetLastFrame(game) {
  var lf = game.getLatestFrame();
  if (lf == null) return null;
  if (lf == undefined) return null;
  return lf.frame;
}

function logProgress(count, total){
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(count + '/' + total);
}

function logMessage(message) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  console.log(message);
}

function GetTimeText(n) {
  var t = n/60;
  var min = (Math.floor(t / 60)).toString();
  var sec = (t % 60).toFixed(2);
  return ((min.length < 2) ? "0" + min : min) + "m" + ((sec.length < 5) ? "0" + sec[0] : sec[0] + sec[1]) +"s";
}

function BCheck(buttons, buttonToCheck) {
  // check if button is being held using bitwise
  return (buttons & buttonToCheck) != Button.none;
}

// setting up input checks for each possible input
const inputChecks = {
  "A" : function(pre) { return BCheck(pre.physicalButtons, Button.a); },
  "B" : function(pre) { return BCheck(pre.physicalButtons, Button.b); }, 
  "X" : function(pre) { return BCheck(pre.physicalButtons, Button.x); }, 
  "Y" : function(pre) { return BCheck(pre.physicalButtons, Button.y); }, 
  "Z" : function(pre) { return BCheck(pre.physicalButtons, Button.z); }, 
  "L" : function(pre) { return (BCheck(pre.physicalButtons, Button.l) || pre.physicalLTrigger > 0.5); }, 
  "R" : function(pre) { return (BCheck(pre.physicalButtons, Button.r) || pre.physicalRTrigger > 0.5); }, 
  "Start" : function(pre) { return BCheck(pre.physicalButtons, Button.start); }, 
  "DpadRight" : function(pre) { return BCheck(pre.physicalButtons, Button.dpadRight); }, 
  "DpadLeft" : function(pre) { return BCheck(pre.physicalButtons, Button.dpadLeft); }, 
  "DpadUp" : function(pre) { return BCheck(pre.physicalButtons, Button.dpadUp); }, 
  "DpadDown" : function(pre) { return BCheck(pre.physicalButtons, Button.dpadDown); }
}

// Now heading into the main logic

// find all slp files

function SearchDirectory(cur_path) {
  var dirs = fs.readdirSync(cur_path, {withFileTypes : true});
  for (var i=0;i<dirs.length;i++) {
    if (dirs[i].isFile()) {
      if (path.extname(dirs[i].name) == ".slp") {
        files.push((using_absolute_paths ? "" : (__dirname + "/") ) + cur_path + "/" + dirs[i].name);
      }
    }
    else if (dirs[i].isDirectory()) {
      SearchDirectory(cur_path + "/" + dirs[i].name);
    }
  }
}

var files = [];

SearchDirectory(replay_path);

console.log(`Found ${files.length} replay files!`);

// create output json object (what dolphin reads)
var output = {
  "mode": "queue",
  "replay": "",
  "isRealTimeMode": false,
  "outputOverlayFiles": true,
  "queue": []
};

var momentCount = 0;

logProgress(0, files.length);

// for each file
for (var i=0;i<files.length;i++) {

  logProgress(i+1, files.length);

  // grab parsed game object from slp-parser-js
  const game = new SlippiGame(files[i]);
  
  const settings = game.getSettings();

  // check if we should skip the file or if its broken

  if (skipCPUmatches) {
    var skip = false;
    for (var n=0;n<settings.players.length;n++) {
      // if cpu
      if (settings.players[n].type != 0) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
  }

  const lastframe = GetLastFrame(game);
  if (lastframe == null) {
    logMessage("Bad file!");
    continue;
  }

  /*if (!game.getGameEnd()) {
    console.log("Bad file! Did the game crash?");
    continue;
  }*/

  const frames = game.getFrames();

  if (frames == null) {
    logMessage("Bad file!");
    continue;
  }

  // if game is too short
  if (lastframe < minimumGameTime) continue;

  // reset lockout
  var lockout = 0;

  // for each frame in the game
  for (var n=-123;n<lastframe;n++) {

    if (frames[n] == null) break;

    // if currently locked out, skip test
    if (lockout > 0) {
      lockout--;
    }
    else {
      // for each player
      for (var p=0;p<frames[n].players.length;p++) {
        if (frames[n].players[p] == null) continue;

        // grab inputs
        var pre = frames[n].players[p].pre;

        // check input for the capture input command
        var foundInputCommand = true;
        for (var a=0;a<captureInputCommand.length;a++) {
          if (!inputChecks[captureInputCommand[a]](pre)) {
            foundInputCommand = false;
            break;
          }
        }

        if (foundInputCommand) {

          // if input was found during (Ready! GO!)
          if (n < 45) {
            // ENDER FROM PREVIOUS GAME
            // if prev game exists
            if (i > 0) {
              const prev_game = new SlippiGame(files[i-1]);
              const prev_settings = prev_game.getSettings();
              const prev_lastframe = GetLastFrame(prev_game);
              if (prev_lastframe == null) {
                logMessage("Found Ender with bad file!");
                continue;
              }

              if (CharIsAcceptable(prev_settings.players, p)) {

                output.queue[momentCount] = {
                  "path" : files[i-1],
                  "startFrame" : Math.max(-123, prev_lastframe-captureTimePreInput),
                  "endFrame" : prev_lastframe
                }

                lockout = captureLockoutTime;
                momentCount++;

                logMessage(`[MOMENT #${momentCount.toString().padStart(1, '0')}] Port ${p+1} | ${GetCharName(prev_settings.players, p)} | ${slp.stages.getStageName(prev_settings.stageId)} | ${GetTimeText(prev_lastframe)} into game | ENDER!`);
              }

            }
          }
          else {

            if (CharIsAcceptable(settings.players, p)) {
              // FOUND MOMENT!
              output.queue[momentCount] = {
                "path" : files[i],
                "startFrame" : Math.max(-123, n-captureTimePreInput),
                "endFrame" : Math.min(lastframe, n+captureTimePostInput)
              }
              
              lockout = captureLockoutTime;
              momentCount++;
              
              logMessage(`[MOMENT #${momentCount.toString().padStart(1, '0')}] Port ${p+1} | ${GetCharName(settings.players, p)} | ${slp.stages.getStageName(settings.stageId)} | ${GetTimeText(n)} into game`);
            }
          }
        }
      }
    }
  }
}

console.log("\n");
console.log(`Found ${momentCount} moments!`);

// now write the output to a json file

let jsonText = JSON.stringify(output);

fs.writeFile(`${output_path_and_filename}.json`, jsonText, function(err) {
    if(err) {
        return console.log(err);
    }

    console.log("Replay clip queue file was saved!");
});
