/*
 * Stop-signal/go-no-go plugin for jsPsych v6.0.1
 *
 * Becky Gilbert
 *
 */

jsPsych.plugins["stop-signal-go-no-go-raf"] = (function() {

  // can only register preload for the stimuli that are always non-null
  // audio for the 'stop_audio' parameter is optional so must be preloaded separately
  jsPsych.pluginAPI.registerPreload('stop-signal-go-no-go-raf', 'go_stimulus', 'image');
  jsPsych.pluginAPI.registerPreload('stop-signal-go-no-go-raf', 'no_go_stimulus', 'image');
  jsPsych.pluginAPI.registerPreload('stop-signal-go-no-go-raf', 'stop_audio', 'audio');

  var plugin = {};
  
  plugin.info = {
    name: "stop-signal-go-no-go-raf",
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
      est_frame_duration: {
        type: jsPsych.plugins.parameterType.FLOAT,
        default: 16.67,
        description: 'Estimated duration between frames (in ms)'
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

    var stim_html, trial_stim, keyboardListener;
    var response = {
      rt: null,
      key: null,
      rt_manual: null
    };
    var stop_signal_onset_log = null;
    var stop_signal_onset_adj = null;
    var frame_count = null;
    var stop_signal_target_frame_count = null;

    // use a prefixed version of rAF if necessary
    // from https://msdn.microsoft.com/en-us/library/hh920765(v=vs.85).aspx
    // TO DO: 
    // - record in results which method was used
    // - add fallback to Date.now() timestamps for early implementations of rAF that pass a Date.now rather than performance.now timestamp
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame =
      window.mozRequestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      // if there's no support for rAF then fall back to set timeout at 60 fps
      function(callback) {
        return window.setTimeout(callback, 1000/60);
      };
    }

    // set up first stimulus
    if (trial.trial_type_ss_gng.toLowerCase() === 'go' || trial.trial_type_ss_gng.toLowerCase() === 'stop') {
      stim_html = '<div id="jspsych-stop-signal-go-no-go-stim"><img src="'+trial.go_stimulus+'" id="go-img"></div>';
      trial_stim = trial.go_stimulus;
    } else if (trial.trial_type_ss_gng.toLowerCase() === 'no-go') {
      stim_html = '<div id="jspsych-stop-signal-go-no-go-stim"><img src="'+trial.no_go_stimulus+'" id="no-go-img"></div>';
      trial_stim = trial.no_go_stimulus;
    } 

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
        "rt_manual": response.rt_manual, // this is always a little longer than response.rt - maybe because of delay before after_response function is executed?
        "stimulus": trial_stim,
        "trial_type_ss_gng": trial.trial_type_ss_gng, 
        "key_press": response.key,
        "stop_signal_onset": trial.stop_signal_onset,
        "stop_signal_onset_adj": stop_signal_onset_adj,
        "stop_signal_onset_log": stop_signal_onset_log,
        "stop_signal_target_log_diff": stop_signal_onset_adj - stop_signal_onset_log,
        "stop_signal_target_frame_count": stop_signal_target_frame_count,
        "frame_count": frame_count
      };

      // clear the display
      display_element.innerHTML = '';

      // move on to the next trial
      jsPsych.finishTrial(trial_data);
    };

    // function to handle responses by the subject
    var after_response = function(info) {  

      // cancel any existing rAF callbacks

      // get timestamp to compare to start_time_manual, to get a manual RT measure
      var end_time_manual = performance.now();
      var rt_manual = end_time_manual - start_time_manual;

      // after a valid response, the stimulus will have the CSS class 'responded'
      // which can be used to provide visual feedback that a response was recorded
      display_element.querySelector('#jspsych-stop-signal-go-no-go-stim').className += ' responded';

      // only record the first response
      if (response.key === null) {
        response = info;
        response.rt_manual = rt_manual;
      }
      console.log('RT:', response.rt);

      if (trial.response_ends_trial) {
        end_trial();
      }
    };

    // TO DO: use requestAnimationFrame for *all* events that occur after a specific delay
    // 1. stop_signal_onset to show the stop signal image/audio (if this is a stop trial)
    // 2. stimulus_duration to hide stim (if set)
    // 3. trial_duration to end trial (if set)

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

    // function to show stop signal image/audio
    function showStopSignal() {
      var ss_time = performance.now();
      if (trial.stop_audio !== null) {
        // show image
        display_element.innerHTML = '<div id="jspsych-stop-signal-go-no-go-stim"><img src="'+trial.no_go_stimulus+'" id="stop-img"></div>';
        // start audio
        if(context !== null){
          startTime = context.currentTime;
          source.start(startTime);
        } else {
          audio.play();
        }
      } else {
        // show image
        display_element.innerHTML = '<div id="jspsych-stop-signal-go-no-go-stim"><img src="'+trial.no_go_stimulus+'" id="stop-img"></div>';
      }
      stop_signal_onset_log = ss_time - start_time_manual;
      console.log('logged SS onset: ', stop_signal_onset_log);
    }

    function checkForTimeouts(timestamp, intended_delay, intended_frame_count, event_fn) {
      // compare current timestamp to that from the first stim onset to get the current time relative to stim onset
      var curr_delay = timestamp - start_time_manual; 
      // if the current delay is close to the intended delay, or if we've reached the intended frame count, then call the function for that event 
      if (curr_delay >= intended_delay || intended_frame_count == frame_count) {
        event_fn();
      } else {
        // not enough time has elapsed, so call rAF with this function as the callback again
        window.requestAnimationFrame(function(timestamp) {
          frame_count++;
          checkForTimeouts(timestamp, intended_delay, intended_frame_count, event_fn);});
      }
    }

    // draw first stimulus (go or no-go)
    // use requestAnimationFrame so that the logged display start time is as close as possible to the real display start time
    window.requestAnimationFrame(function(timestamp) {
      display_element.innerHTML = stim_html;
      start_time_manual = timestamp;
      // keyboard listener logs the start time and uses that to get the RT, so it needs to be synchronised to the display onset (I think?)
      if (trial.choices != jsPsych.NO_KEYS) {
        keyboardListener = jsPsych.pluginAPI.getKeyboardResponse({
          callback_function: after_response,
          valid_responses: trial.choices,
          rt_method: 'performance',
          persist: false,
          allow_held_key: false
        });
      }
      // if this is a stop trial and the stop signal time is valid, continue calling rAF with SS parameters
      if (trial.trial_type_ss_gng.toLowerCase() == 'stop' && trial.stop_signal_onset >= 0) {
        var lower_dur = Math.floor(trial.stop_signal_onset/trial.est_frame_duration) * trial.est_frame_duration;
        var upper_dur = Math.ceil(trial.stop_signal_onset/trial.est_frame_duration) * trial.est_frame_duration;
        if ((trial.stop_signal_onset - lower_dur) <= (trial.est_frame_duration/2)) {
          stop_signal_onset_adj = lower_dur;
        } else {
          stop_signal_onset_adj = upper_dur;
        }
        stop_signal_target_frame_count = stop_signal_onset_adj/trial.est_frame_duration;
        console.log('adjusted SS target onset: ', stop_signal_onset_adj);
        window.requestAnimationFrame(function(timestamp) {
          frame_count=1;
          // subtract 2 from adjusted intended delay to account for rounding errors
          checkForTimeouts(timestamp, stop_signal_onset_adj - 2, stop_signal_target_frame_count, showStopSignal);
        });
      }
    });

  };

  return plugin;
})();
