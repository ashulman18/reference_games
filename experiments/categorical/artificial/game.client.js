

//   Copyright (c) 2012 Sven "FuzzYspo0N" Bergström,
//                   2013 Robert XD Hawkins

//     written by : http://underscorediscovery.com
//     written for : http://buildnewgames.com/real-time-multiplayer/

//     modified for collective behavior experiments on Amazon Mechanical Turk

//     MIT Licensed.


// /*
//    THE FOLLOWING FUNCTIONS MAY NEED TO BE CHANGED
// */

// A window global for our game root variable.
var globalGame = {};
// Keeps track of whether player is paying attention...
var incorrect;
var dragging;
var waiting;

//test: let's try a variable selecting, for when the listener selects an object
// we don't need the dragging.
var selecting;

var client_onserverupdate_received = function(data){

  // Update client versions of variables with data received from
  // server_send_update function in game.core.js
  //data refers to server information
  if(data.players) {
    _.map(_.zip(data.players, globalGame.players),function(z){
      z[1].id = z[0].id;
    });
  }
  
  if (globalGame.roundNum != data.roundNum) {
    globalGame.objects = _.map(data.trialInfo.currStim, function(obj) {
      // Extract the coordinates matching your role
      var customCoords = globalGame.my_role == "speaker" ? obj.speakerCoords : obj.listenerCoords;
      // remove the speakerCoords and listenerCoords properties
      var customObj = _.chain(obj)
	  .omit('speakerCoords', 'listenerCoords')
	  .extend(obj, {trueX : customCoords.trueX, trueY : customCoords.trueY,
			gridX : customCoords.gridX, gridY : customCoords.gridY,
			box : customCoords.box})
	  .value();
      
      var imgObj = new Image(); //initialize object as an image (from HTML5)
      imgObj.onload = function(){ // Draw image as soon as it loads (this is a callback)
        globalGame.ctx.drawImage(imgObj, parseInt(customObj.trueX), parseInt(customObj.trueY),
				 customObj.width, customObj.height);
        if (globalGame.my_role === globalGame.playerRoleNames.role1) {
          highlightCell(globalGame, '#d15619', function(x) {return x.targetStatus == 'target';});
        }
      };
      imgObj.src = customObj.url; // tell client where to find it
      return _.extend(customObj, {img: imgObj});
    });
  };

  // Get rid of "waiting" screen if there are multiple players
  if(data.players.length > 1) {
    $('#messages').empty();
    $("#chatbox").removeAttr("disabled");
    $('#chatbox').focus();
    globalGame.get_player(globalGame.my_id).message = "";
  }

  globalGame.game_started = data.gs;
  globalGame.players_threshold = data.pt;
  globalGame.player_count = data.pc;
  globalGame.roundNum = data.roundNum;
  if(!_.has(globalGame, 'data')) {
    globalGame.data = data.dataObj;
  }

  if ((globalGame.roundNum > 2) && (globalGame.my_role === globalGame.playerRoleNames.role1)) { //TRIAL OVER
    $('#instructs').empty()
      .append("Send messages to tell the listener where the lily is. To get points, you only need to make them click near the lily. There is no bonus for increased accuracy.");
  }

  // Draw all this new stuff
  drawScreen(globalGame, globalGame.get_player(globalGame.my_id));
};

var client_onMessage = function(data) {

  var commands = data.split('.');
  var command = commands[0];
  var subcommand = commands[1] || null;
  var commanddata = commands[2] || null;

  switch(command) {
  case 's': //server message
    switch(subcommand) {
    case 'end' :
      // Redirect to exit survey
      ondisconnect();
      console.log("received end message...");
      break;

    case 'feedback' :
      $("#chatbox").attr("disabled", "disabled");
      // update local score
      var clickedObjName = commanddata;
      var target = _.filter(globalGame.objects, (x) => {
	return x.targetStatus == 'target';
      })[0];
      var scoreDiff = target.subID == clickedObjName ? 1 : 0;
      globalGame.data.subject_information.score += scoreDiff;
      $('#score').empty()
        .append("Bonus: $" + (globalGame.data.subject_information.score/100).toFixed(3));
      
      // draw feedback
      if (globalGame.my_role === globalGame.playerRoleNames.role1) {
	drawSketcherFeedback(globalGame, scoreDiff, clickedObjName);
      } else {
	drawViewerFeedback(globalGame, scoreDiff, clickedObjName);
      }

      break;

    case 'alert' : // Not in database, so you can't play...
      alert('You did not enter an ID');
      window.location.replace('http://nodejs.org'); break;

    case 'join' : //join a game requested
      var num_players = commanddata;
      client_onjoingame(num_players, commands[3]); break;

    case 'add_player' : // New player joined... Need to add them to our list.
      console.log("adding player" + commanddata);
      clearTimeout(globalGame.timeoutID);
      if(hidden === 'hidden') {
        flashTitle("GO!");
      }
      globalGame.players.push({id: commanddata,
             player: new game_player(globalGame)}); break;
    }
  }
};

var client_addnewround = function(game) {
  $('#roundnumber').append(game.roundNum);
};

var customSetup = function(game) {
  // Set up new round on client's browsers after submit round button is pressed.
  // This means clear the chatboxes, update round number, and update score on screen
  game.socket.on('newRoundUpdate', function(data){
    $('#messages').empty();
    if(game.roundNum + 2 > game.numRounds) {
      $('#roundnumber').empty();
      $('#instructs').empty()
        .append("Round\n" + (game.roundNum + 1) + "/" + game.numRounds);
    } else {
      $('#feedback').empty();
      $('#roundnumber').empty()
        .append("Round\n" + (game.roundNum + 2) + "/" + game.numRounds);
    }
  });
};

var client_onjoingame = function(num_players, role) {
  // set role locally
  globalGame.my_role = role;
  globalGame.get_player(globalGame.my_id).role = globalGame.my_role;

  _.map(_.range(num_players - 1), function(i){
    globalGame.players.unshift({id: null, player: new game_player(globalGame)});
  });

  // Update w/ role (can only move stuff if agent)
  $('#roleLabel').append(role + '.');
  if(role === globalGame.playerRoleNames.role1) {
    $('#instructs').append("Send messages to tell the listener where the lily is. To get points, you only need to make them click within the circle around the lily. There is no bonus for increased accuracy. The circle will not appear after the first 3 trials.");
  } else if(role === globalGame.playerRoleNames.role2) {
    $('#instructs').append("Click as closely as possible to the location of the lily on the map.");
  }

  if(num_players == 1) {
    this.timeoutID = setTimeout(function() {
      if(_.size(this.urlParams) == 4) {
        this.submitted = true;
        window.opener.turk.submit(this.data, true);
        window.close();
      } else {
        console.log("would have submitted the following :");
        console.log(this.data);
      }
    }, 1000 * 60 * 15);
    $("#chatbox").attr("disabled", "disabled");
    globalGame.get_player(globalGame.my_id).message = ('Waiting for another player to connect... '
              + 'Please do not refresh the page!');
  }

  // set mouse-tracking event handler
  if(role === globalGame.playerRoleNames.role2) {
    globalGame.viewport.addEventListener("click", mouseClickListener, false);
  }
};

/*
 MOUSE EVENT LISTENERS
 */

function mouseClickListener(evt) {
  var bRect = globalGame.viewport.getBoundingClientRect();
  var mouseX = Math.floor((evt.clientX - bRect.left)*(globalGame.viewport.width/bRect.width));
  var mouseY = Math.floor((evt.clientY - bRect.top)*(globalGame.viewport.height/bRect.height));
  if (globalGame.messageSent) { // if message was not sent, don't do anything
    console.log('click');
    _.forEach(globalGame.objects, function(obj) {
      console.log(obj);
      if (hitTest(obj, mouseX, mouseY)) {
	console.log('hit!');
	globalGame.messageSent = false;
        //highlight the object that was clicked:
        // var upperLeftXListener = obj.listenerCoords.gridPixelX;
        // var upperLeftYListener = obj.listenerCoords.gridPixelY;
        // if (upperLeftXListener != null && upperLeftYListener != null) {
        //   globalGame.ctx.beginPath();
        //   globalGame.ctx.lineWidth="10";
        //   globalGame.ctx.strokeStyle="black";
        //   globalGame.ctx.rect(upperLeftXListener+5, upperLeftYListener+5,290,290); 
        //   globalGame.ctx.stroke();
        // }
	// Tell the server about it
        globalGame.socket.send(["clickedObj", obj.subID].join('.'));
      }
    });
  };
};

function hitTest(shape,mx,my) {
  console.log(shape)
  console.log(mx + ',' + my);
  var dx = mx - shape.trueX;
  var dy = my - shape.trueY;
  return (0 < dx) && (dx < shape.width) && (0 < dy) && (dy < shape.height);
}
