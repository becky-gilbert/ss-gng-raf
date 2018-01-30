/*
 * Stop-signal/go-no-go plugin for jsPsych v6.0.1
 *
 * Becky Gilbert
 *
 */

jsPsych.plugins["stop-signal-go-no-go"] = (function() {

  // can only register preload for the stimuli that are always non-null
  // audio for the 'stop_audio' parameter is optional so must be preloaded separately
  jsPsych.pluginAPI.registerPreload('stop-signal-go-no-go', 'go_stimulus', 'image');
  jsPsych.pluginAPI.registerPreload('stop-signal-go-no-go', 'no_go_stimulus', 'image');
  jsPsych.pluginAPI.registerPreload('stop-signal-go-no-go', 'stop_audio', 'audio');

  var plugin = {};
  
  plugin.info = {
    name: "stop-signal-go-no-go",
    parameters: {
      go_stimulus: {
        type: jsPsych.plugins.parameterType.IMAGE, // INT, IMAGE, KEYCODE, STRING, FUNCTION, FLOAT
        default: undefined,
        description: 'Image file for go trials.'
      },
      no_go_stimulus: {
        type: jsPsych.plugins.parameterType.IMAGE,
        default: undefined,
        description: 'Image file for no-go and stop trials.'
      },
      stop_audio: {
        type: jsPsych.plugins.parameterType.STRING,
        default: null,
        description: 'Stop signal audio (if any).' 
      },
      choices: {
        type: jsPsych.plugins.parameterType.KEYCODE,
        array: true,
        pretty_name: 'Choices',
        default: jsPsych.ALL_KEYS,
        description: 'The keys the subject is allowed to press to respond to the stimulus.'
      },
      trial_type_ss_gng: {
        type: jsPsych.plugins.parameterType.STRING,
        default: 'go', // 'go', 'no-go', 'stop'
        description: 'Whether this is a go, no-go, or stop trial.'
      },
      stop_signal_onset: {
        type: jsPsych.plugins.parameterType.INT,
        default: 200,
        description: 'Time in ms from start of trial to when stop signal should appear.'
      },
      stimulus_duration: {
        type: jsPsych.plugins.parameterType.INT,
        pretty_name: 'Stimulus duration',
        default: null,
        description: 'Time in ms from start of trial to when the stimulus should be hidden.'
      },
      trial_duration: {
        type: jsPsych.plugins.parameterType.INT,
        pretty_name: 'Trial duration',
        default: null,
        description: 'How long to show trial before it ends.'
      },
      response_ends_trial: {
        type: jsPsych.plugins.parameterType.BOOL,
        pretty_name: 'Response ends trial',
        default: true,
        description: 'If true, trial will end when subject makes a response.'
      }
    }
  };

  plugin.trial = function(display_element, trial) {

    var stim_html, trial_stim;

    if (trial.trial_type_ss_gng.toLowerCase() === 'go' || trial.trial_type_ss_gng.toLowerCase() === 'stop') {
      stim_html = '<div id="jspsych-stop-signal-go-no-go-stim"><img src="'+trial.go_stimulus+'" id="go-img"></div>';
      trial_stim = trial.go_stimulus;
    } else if (trial.trial_type_ss_gng.toLowerCase() === 'no-go') {
      stim_html = '<div id="jspsych-stop-signal-go-no-go-stim"><img src="'+trial.no_go_stimulus+'" id="no-go-img"></div>';
      trial_stim = trial.no_go_stimulus;
    } 

    // draw first stimulus (go or no-go)
    display_element.innerHTML = stim_html;

    // if necessary, set up stop signal audio to be played at the stop signal onset time
    if (trial.trial_type_ss_gng.toLowerCase() === 'stop' && trial.stop_audio !== null) {
      var context = jsPsych.pluginAPI.audioContext();
      if(context !== null){
        var source = context.createBufferSource();
        source.buffer = jsPsych.pluginAPI.getAudioBuffer(trial.stop_audio);
        source.connect(context.destination);
      } else {
        var audio = jsPsych.pluginAPI.getAudioBuffer(trial.stop_audio);
        audio.currentTime = 0;
      }
    }
    
    // store response
    var response = {
      rt: null,
      key: null
    };

    // function to end trial when it is time
    var end_trial = function() {

      // kill any remaining setTimeout handlers
      jsPsych.pluginAPI.clearAllTimeouts();

      // kill keyboard listeners
      if (typeof keyboardListener !== 'undefined') {
        jsPsych.pluginAPI.cancelKeyboardResponse(keyboardListener);
      }

      // gather the data to store for the trial
      var trial_data = {
        "rt": response.rt,
        "stimulus": trial_stim,
        "trial_type_ss_gng": trial.trial_type_ss_gng, 
        "key_press": response.key,
        "stop_signal_onset": trial.stop_signal_onset
      };

      // clear the display
      display_element.innerHTML = '';

      // move on to the next trial
      jsPsych.finishTrial(trial_data);
    };

    // function to handle responses by the subject
    var after_response = function(info) {

      // after a valid response, the stimulus will have the CSS class 'responded'
      // which can be used to provide visual feedback that a response was recorded
      display_element.querySelector('#jspsych-stop-signal-go-no-go-stim').className += ' responded';

      // only record the first response
      if (response.key === null) {
        response = info;
      }

      if (trial.response_ends_trial) {
        end_trial();
      }
    };

    // start the response listener
    if (trial.choices != jsPsych.NO_KEYS) {
      var keyboardListener = jsPsych.pluginAPI.getKeyboardResponse({
        callback_function: after_response,
        valid_responses: trial.choices,
        rt_method: 'performance',
        persist: false,
        allow_held_key: false
      });
    }

    // set up the timer to hide the stimulus if stimulus_duration is set
    if (trial.stimulus_duration !== null) {
      jsPsych.pluginAPI.setTimeout(function() {
        display_element.querySelector('#jspsych-stop-signal-go-no-go-stim').style.visibility = 'hidden';
      }, trial.stimulus_duration);
    }

    // set up the end trial timer if trial_duration is set
    if (trial.trial_duration !== null) {
      jsPsych.pluginAPI.setTimeout(function() {
        end_trial();
      }, trial.trial_duration);
    }

    // if this is a stop trial, set up the the timer to show the stop image and/or audio
    if (trial.trial_type_ss_gng.toLowerCase() == 'stop' && trial.stop_signal_onset >= 0) {
      if (trial.stop_audio !== null) {
        jsPsych.pluginAPI.setTimeout(function() {
          // show stop signal image
          display_element.innerHTML = '<div id="jspsych-stop-signal-go-no-go-stim"><img src="'+trial.no_go_stimulus+'" id="stop-img"></div>';
          // start stop signal audio
          if(context !== null){
            startTime = context.currentTime;
            source.start(startTime);
          } else {
            audio.play();
          }
        }, trial.stop_signal_onset);
        
      } else {
        jsPsych.pluginAPI.setTimeout(function() {
          // show stop signal image
          display_element.innerHTML = '<div id="jspsych-stop-signal-go-no-go-stim"><img src="'+trial.no_go_stimulus+'" id="stop-img"></div>';
        }, trial.stop_signal_onset);
      }
    }
  };

  return plugin;
})();
