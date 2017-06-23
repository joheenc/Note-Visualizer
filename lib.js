var buffer = [];
var sample_length_milliseconds = 100;
var C2 = 65.41; // C2 note, in Hz.
var notes = [ "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" ];
var test_frequencies = [];
var volume_thresh = 20000;

for (var i = 0; i < 30; i++)
{
	var note_frequency = C2 * Math.pow(2, i / 12);
	var note_name = notes[i % 12];
	var note = { "frequency": note_frequency, "name": note_name };
	var just_above = { "frequency": note_frequency * Math.pow(2, 1 / 48), "name": note_name + " (a bit sharp)" };
	var just_below = { "frequency": note_frequency * Math.pow(2, -1 / 48), "name": note_name + " (a bit flat)" };
	test_frequencies = test_frequencies.concat([ just_below, note, just_above ]);
}

onNewNote = function(freq){
	console.log(freq);
};

var recording = false;

function use_stream(stream)
{
	var audio_context = new AudioContext();
	var microphone = audio_context.createMediaStreamSource(stream);
	window.source = microphone; // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=934512

	var script_processor = audio_context.createScriptProcessor(1024, 1, 1);
	script_processor.connect(audio_context.destination);
	microphone.connect(script_processor);
	// Need to leak this function into the global namespace so it doesn't get
	// prematurely garbage-collected.
	// http://lists.w3.org/Archives/Public/public-audio/2013JanMar/0304.html
	window.capture_audio = function(event)
	{
		if (!recording)
			return;
		buffer = buffer.concat(Array.prototype.slice.call(event.inputBuffer.getChannelData(0)));
		// Stop recording after sample_length_milliseconds.
		if (buffer.length > sample_length_milliseconds * audio_context.sampleRate / 1000)
		{
			compute_correlations(buffer, test_frequencies, audio_context.sampleRate, volume_thresh);
			buffer = [];
		}
	};
	script_processor.onaudioprocess = window.capture_audio;
}

function startListen(bpm, volume){
	sample_length = 1000 / ((bpm / 60) * 4);
	navigator.getUserMedia({ "audio": true }, use_stream, function() {});
	recording = true;
	sample_length_milliseconds = sample_length;
	volume_thresh = volume;
}

function endListen(){
	recording = false;
}


function compute_correlations(timeseries, test_frequencies, sample_rate)
{
	// 2pi * frequency gives the appropriate period to sine.
	// timeseries index / sample_rate gives the appropriate time coordinate.
	var scale_factor = 2 * Math.PI / sample_rate;
	var amplitudes = test_frequencies.map
	(
		function(f)
		{
			var frequency = f.frequency;

			// Represent a complex number as a length-2 array [ real, imaginary ].
			var accumulator = [ 0, 0 ];
			for (var t = 0; t < timeseries.length; t++)
			{
				accumulator[0] += timeseries[t] * Math.cos(scale_factor * frequency * t);
				accumulator[1] += timeseries[t] * Math.sin(scale_factor * frequency * t);
			}

			return accumulator;
		}
	);
	interpret_correlation_result(timeseries, amplitudes);
}

function interpret_correlation_result(timeseries, frequency_amplitudes)
{
	// Compute the (squared) magnitudes of the complex amplitudes for each
	// test frequency.
	var magnitudes = frequency_amplitudes.map(function(z) { return z[0] * z[0] + z[1] * z[1]; });
	// Find the maximum in the list of magnitudes.
	var maximum_index = -1;
	var maximum_magnitude = 0;
	for (var i = 0; i < magnitudes.length; i++)
	{
		if (magnitudes[i] <= maximum_magnitude)
			continue;
		maximum_index = i;
		maximum_magnitude = magnitudes[i];
	}
	console.log(maximum_magnitude);
	// Compute the average magnitude. We'll only pay attention to frequencies
	// with magnitudes significantly above average.
	var average = magnitudes.reduce(function(a, b) { return a + b; }, 0) / magnitudes.length;
	var confidence = maximum_magnitude / average;
	var confidence_threshold = 9.3; // empirical, arbitrary.
	if (confidence > confidence_threshold && maximum_magnitude > 7000)
	{
		var dominant_frequency = test_frequencies[maximum_index];
		onNewNote(dominant_frequency.frequency);
	}
	else{
		onNewNote(0, true);
	}
}
