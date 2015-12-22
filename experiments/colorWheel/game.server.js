/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström, 2013 Robert XD Hawkins
    
    written by : http://underscorediscovery.com
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    modified for collective behavior experiments on Amazon Mechanical Turk

    MIT Licensed.
*/

var
  fs          = require('fs'),
  utils       = require('../sharedUtils/sharedUtils.js');

// The server parses and acts on messages sent from 'clients'
var onMessage = function(client,message) {
  //Cut the message up into sub components
  var message_parts = message.split('.');
  
  //The first is always the type of message
  var message_type = message_parts[0];
  
  //Extract important variables
  var gc = client.game;
  var id = gc.id.slice(0,6);
  var all = gc.get_active_players();
  var target = gc.get_player(client.userid);
  var others = gc.get_others(client.userid);


  switch(message_type) {
      
  case 'advanceRound' :
    var color = message_parts[1];
    var score = gc.calcScore(color, gc.trialInfo.currStim);
    writeData(client, "outcome", message_parts + score);
    console.log(score);
    _.map(all, function(p){
      p.player.instance.emit( 'newRoundUpdate', {user: client.userid, score: score});});
    gc.newRound();
    break;
  
  case 'playerTyping' :
    console.log("player is typing?", message_parts[1]);
    _.map(others, function(p) {
      p.player.instance.emit( 'playerTyping',
			      {typing: message_parts[1]});
    });
    break;
  
  case 'chatMessage' :
    if(client.game.player_count == 2 && !gc.paused) {
      writeData(client, "message", message_parts);
    }
    // Update others
    var msg = message_parts[1].replace(/~~~/g,'.');
    _.map(all, function(p){
      p.player.instance.emit( 'chatMessage', {user: client.userid, msg: msg});});
    break;

  case 'h' : // Receive message when browser focus shifts
    target.visible = message_parts[1];
    break;
  }
};

var writeData = function(client, type, message_parts) {
  var gc = client.game;
  var roundNum = gc.state.roundNum + 1;
  var id = gc.id.slice(0,6);
  var line;
  switch(type) {
  case "outcome" :
    console.log(gc.trialInfo.currStim);
    var color = message_parts.slice(1, 4).join(',');
    line = (id + ',' + Date.now() + ',' + roundNum + ',' +
	    gc.trialInfo.currStim + ',' + color);
    break;
    
    case "message" :
      var msg = message_parts[1].replace('~~~','.');
      line = (id + ',' + Date.now() + ',' + roundNum + ',' +
	      client.role + ',"' + msg + '"\n');
      break;
  }
  console.log(type + ":" + line);
  gc.streams[type].write(line, function (err) {if(err) throw err;});
};

var startGame = function(game, player) {
  console.log("starting game" + game.id);
  // Establish write streams
  var startTime = utils.getLongFormTime();
  var dataFileName = startTime + "_" + game.id;
  utils.establishStream(game, "message", dataFileName,
		       "gameid,time,roundNum,sender,contents\n");
  utils.establishStream(game, "outcome", dataFileName,
		       "gameid,time,roundNum,targetCol,submittedCol,score\n");
  game.newRound();
  game.server_send_update();
};

module.exports = {
  writeData : writeData,
  startGame : startGame,
  onMessage : onMessage
};
