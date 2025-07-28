const audioInput = document.getElementById("audio");
let noise = new SimplexNoise();
const area = document.getElementById("visualizer");
const label = document.getElementById("label");
audioInput.addEventListener("change", setAudio, false);
let audio = new Audio("");

// Global dance-related variables
let characters = []; // Array to hold all 10 characters (step0-step9)
let mixers = []; // Array to hold all 10 mixers
let scene; // Global scene variable
let isVisualizationStarted = false; // Prevent multiple startVis calls
let audioContext = null;
let analyser = null;
let currentStep = 0; // Track current step (0-3 for beat-reactive)
let charactersLoadedCount = 0; // Track loading progress
let stepProgressionInterval = null; // Interval for step progression
let beatDetector = null; // Beat detector instance
let lastBeatTime = 0;
let currentTempo = 0;
let beatCount = 0;
let track1, track2, track3, track4, track5;

// Vibrant and contrasting colors for each ring
const palette = [
  "#00bfff", // Blue
  "#8a2be2", // Violet
  "#191970", // Dark Blue
  "#ff1493", // Dark Pink
  "#da70d6", // Purple/Pink
];

// Function to setup or update audio context
function setupAudioContext() {
  if (audioContext) {
    audioContext.close();
  }
  audioContext = new AudioContext();
  const src = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();
  src.connect(analyser);
  analyser.connect(audioContext.destination);
  analyser.fftSize = 512;

  // Initialize beat detector
  setupBeatDetector(src);
}

// Simple custom beat detection using Web Audio API
function setupBeatDetector(audioSource) {
  // Create a separate analyser for beat detection
  const beatAnalyser = audioContext.createAnalyser();
  audioSource.connect(beatAnalyser);
  beatAnalyser.fftSize = 512;

  const dataArray = new Uint8Array(beatAnalyser.frequencyBinCount);
  let lastBeat = 0;
  let beatHistory = [];
  let energyHistory = [];

  // Start beat detection loop
  setInterval(() => {
    beatAnalyser.getByteFrequencyData(dataArray);

    // Calculate energy in bass frequencies (0-60 Hz approximately)
    const bassEnd = Math.floor(
      (60 * beatAnalyser.frequencyBinCount) / (audioContext.sampleRate / 2)
    );
    let bassEnergy = 0;
    for (let i = 0; i < bassEnd; i++) {
      bassEnergy += dataArray[i];
    }
    bassEnergy = bassEnergy / bassEnd;

    // Store energy history for tempo calculation
    energyHistory.push(bassEnergy);
    if (energyHistory.length > 100) energyHistory.shift(); // Keep last 100 samples

    // Simple beat detection: look for energy spikes
    const avgEnergy =
      energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
    const threshold = avgEnergy * 1.3; // 30% above average

    const now = audioContext.currentTime;
    if (bassEnergy > threshold && now - lastBeat > 0.3) {
      // Min 300ms between beats
      beatHistory.push(now);
      lastBeat = now;
      beatCount++;

      // Calculate BPM from recent beats
      if (beatHistory.length > 4) {
        beatHistory = beatHistory.slice(-8); // Keep last 8 beats
        const intervals = [];
        for (let i = 1; i < beatHistory.length; i++) {
          intervals.push(beatHistory[i] - beatHistory[i - 1]);
        }
        const avgInterval =
          intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const estimatedBPM = 60 / avgInterval;

        // Update tempo if it's reasonable (30-200 BPM)
        if (estimatedBPM >= 30 && estimatedBPM <= 200) {
          currentTempo = estimatedBPM;
          updateDanceStepFromTempo(estimatedBPM);
        }
      }
    }
  }, 50); // Check every 50ms
}

// Update dance step based on tempo analysis
function updateDanceStepFromTempo(bpm) {
  let targetStep;

  if (bpm >= 130) {
    targetStep = 3; // High tempo - energetic dancing
  } else if (bpm >= 90) {
    targetStep = 2; // Medium tempo - moderate dancing
  } else if (bpm >= 70) {
    targetStep = 1; // Slow tempo - gentle movements
  } else {
    targetStep = 0; // Very slow or no clear tempo - idle
  }

  // Only switch if we detect a significant change
  if (targetStep !== currentStep) {
    switchToStep(targetStep);
  }
}

// Load first 4 dance characters for beat-reactive system
function loadDanceCharacters() {
  const loader = new THREE.FBXLoader();
  charactersLoadedCount = 0;

  // Load only steps 0-3 for beat-reactive dancing
  for (let i = 0; i < 4; i++) {
    loader.load(
      `step${i}.fbx`,
      function (object) {
        characters[i] = object;
        characters[i].scale.setScalar(0.3);
        characters[i].position.set(0, 20, 0);
        characters[i].visible = i === 0; // Only step0 visible initially
        scene.add(characters[i]);

        // Set up animation mixer
        if (object.animations && object.animations.length > 0) {
          mixers[i] = new THREE.AnimationMixer(object);
          const action = mixers[i].clipAction(object.animations[0]);
          action.play();
        }

        charactersLoadedCount++;
        if (charactersLoadedCount === 4) {
          switchToStep(0); // Initialize visibility after all loaded
        }
      },
      undefined,
      function (error) {
        console.error(`Error loading step${i}.fbx:`, error);
      }
    );
  }
}

// Function to switch visibility between characters (now using steps 0-3)
function switchToStep(stepIndex) {
  if (stepIndex === currentStep) return;
  if (stepIndex < 0 || stepIndex >= 4) return; // Safety check for steps 0-3

  // Hide all characters
  for (let i = 0; i < Math.min(characters.length, 4); i++) {
    if (characters[i]) {
      characters[i].visible = false;
    }
  }

  // Show only the requested step
  if (characters[stepIndex]) {
    characters[stepIndex].visible = true;
  }

  currentStep = stepIndex;
}

function setAudio() {
  audio.pause();
  const audioFile = this.files[0];
  if (audioFile.type.startsWith("audio/")) {
    const audioURL = URL.createObjectURL(audioFile);
    audio = new Audio(audioURL);
    // Setup audio context for ring animations
    setupAudioContext();
    // Only start visualization if not already started
    if (!isVisualizationStarted) {
      startVis(); // Start the visualization
      isVisualizationStarted = true;
    }
  } else {
    alert("Please upload an audio file");
  }
}

area.addEventListener("click", () => {
  if (audio.paused) {
    audio.play();
    label.style.display = "none";
    // Start timeline-based step progression when audio plays
    startStepProgression();
  } else {
    audio.pause();
    label.style.display = "flex";
    // Return to idle step when audio stops
    switchToStep(0);
    stopStepProgression();
  }
});

// Listen for audio end event
audio.addEventListener("ended", () => {
  label.style.display = "flex";
  switchToStep(0); // Return to idle when audio ends
  stopStepProgression();
});

// Beat-reactive step progression
function startStepProgression() {
  // Reset beat tracking
  beatCount = 0;
  currentTempo = 0;

  // Start with step0 (idle) and let beat detection drive changes
  switchToStep(0);

  // Optional: fallback tempo detection if beat detector doesn't work immediately
  if (stepProgressionInterval) clearInterval(stepProgressionInterval);

  stepProgressionInterval = setInterval(() => {
    // Fallback: analyze frequency data for basic tempo estimation
    if (currentTempo === 0 && analyser) {
      analyser.getByteFrequencyData(new Uint8Array(analyser.frequencyBinCount));
      // Basic energy detection as fallback
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const energy =
        dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;

      if (energy > 100) {
        updateDanceStepFromTempo(130); // Assume medium-high tempo
      } else if (energy > 50) {
        updateDanceStepFromTempo(90); // Assume medium tempo
      } else {
        updateDanceStepFromTempo(70); // Assume slow tempo
      }
    }
  }, 1000); // Check every second for fallback
}

function stopStepProgression() {
  if (stepProgressionInterval) {
    clearInterval(stepProgressionInterval);
    stepProgressionInterval = null;
  }
}

// Start visualization immediately
if (!isVisualizationStarted) {
  startVis();
  isVisualizationStarted = true;
}

function startVis() {
  // Setup initial audio context if not already done
  if (!audioContext) {
    setupAudioContext();
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  scene = new THREE.Scene(); // Assign to global scene variable
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 100;
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor("#000000");

  area.appendChild(renderer.domElement);
  // Create five ring tracks with increasing radii and different segment counts for unique patterns
  const geometry1 = new THREE.RingGeometry(35, 45, 100, 1); // Fine wireframe pattern
  const geometry2 = new THREE.RingGeometry(60, 70, 64, 1); // Medium pattern
  const geometry3 = new THREE.RingGeometry(85, 95, 32, 1); // Coarse pattern
  const geometry4 = new THREE.RingGeometry(110, 120, 16, 1); // Very coarse pattern
  const geometry5 = new THREE.RingGeometry(135, 145, 8, 1); // Minimal segments pattern

  // Create unique materials with different shades of blue
  const material1 = new THREE.MeshLambertMaterial({
    color: "#00bfff", // Deep sky blue - brightest
    wireframe: true,
    side: THREE.DoubleSide,
    emissive: "#001a33", // Subtle blue glow
  });

  const material2 = new THREE.MeshLambertMaterial({
    color: "#4169e1", // Royal blue - medium shade
    wireframe: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    emissive: "#000d1a", // Darker blue glow
  });

  const material3 = new THREE.MeshLambertMaterial({
    color: "#1e3a8a", // Dark blue - deepest shade
    wireframe: true,
    side: THREE.DoubleSide,
    emissive: "#0a1229", // Very subtle glow
  });

  const material4 = new THREE.MeshLambertMaterial({
    color: "#0080ff", // Bright electric blue
    wireframe: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    emissive: "#002080", // Strong blue glow
  });

  const material5 = new THREE.MeshLambertMaterial({
    color: "#00ccff", // Neon cyan blue
    wireframe: true,
    side: THREE.DoubleSide,
    emissive: "#0066cc", // Vibrant blue glow
  });

  track1 = new THREE.Mesh(geometry1, material1);
  track2 = new THREE.Mesh(geometry2, material2);
  track3 = new THREE.Mesh(geometry3, material3);
  track4 = new THREE.Mesh(geometry4, material4);
  track5 = new THREE.Mesh(geometry5, material5);
  const light = new THREE.DirectionalLight("#ffffff", 1);
  light.position.set(0, 50, 100);
  scene.add(light);
  // Add ambient light to ensure the whole ring is visible
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  scene.add(track1);
  scene.add(track2);
  scene.add(track3);
  scene.add(track4);
  scene.add(track5);
  // Lay the flat rings horizontally
  track1.rotation.x = -Math.PI / 2;
  track2.rotation.x = -Math.PI / 2;
  track3.rotation.x = -Math.PI / 2;
  track4.rotation.x = -Math.PI / 2;
  track5.rotation.x = -Math.PI / 2;
  // Lay the track flat horizontally (no need to rotate, RingGeometry is flat by default)
  track1.position.y = 20;
  track2.position.y = 20;
  track3.position.y = 20;
  track4.position.y = 20;
  track5.position.y = 20;

  // Set camera to 45-degree angle from top, positioned to see both rings and character
  camera.position.set(0, 60, 120); // Move camera further back and slightly lower
  camera.lookAt(new THREE.Vector3(0, 0, 0)); // Center on (0,0,0)

  // FBX loading will be done after initial render

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const clock = new THREE.Clock();
  let charactersLoaded = false;

  function updateRingColorsInterRing(bassFr, treFr) {
    // Example logic: cycle palette index for each ring based on audio features.
    // More sensitivity for strong changes.

    // Map each feature into an index (0–4)
    // Amplify for sensitivity and add some variety per ring
    let bassIdx = Math.floor(bassFr * 5) % 5;
    let trebleIdx = Math.floor(treFr * 5) % 5;
    let midIdx = Math.floor(((bassFr + treFr) / 2) * 5) % 5;
    let diffIdx = Math.floor(Math.abs(bassFr - treFr) * 5) % 5;
    let sumIdx = Math.floor(Math.min(1, bassFr + treFr) * 5) % 5;

    track1.material.color.set(palette[bassIdx]);
    track2.material.color.set(palette[trebleIdx]);
    track3.material.color.set(palette[midIdx]);
    track4.material.color.set(palette[diffIdx]);
    track5.material.color.set(palette[sumIdx]);
  }

  function render() {
    const delta = clock.getDelta();

    analyser.getByteFrequencyData(dataArray);

    const lowerHalf = dataArray.slice(0, dataArray.length / 2 - 1);
    const upperHalf = dataArray.slice(
      dataArray.length / 2 - 1,
      dataArray.length - 1
    );

    const lowerMax = max(lowerHalf);
    const upperAvg = avg(upperHalf);

    const lowerMaxFr = lowerMax / lowerHalf.length;
    const upperAvgFr = upperAvg / upperHalf.length;

    track1.rotation.z += modulate(upperAvgFr, 0, 1, 0, 0.05);
    track2.rotation.z += modulate(upperAvgFr, 0, 1, 0, 0.03);
    track3.rotation.z += modulate(upperAvgFr, 0, 1, 0, 0.02);
    track4.rotation.z += modulate(upperAvgFr, 0, 1, 0, 0.015);
    track5.rotation.z += modulate(upperAvgFr, 0, 1, 0, 0.01);

    updateRingColorsInterRing(lowerMaxFr, upperAvgFr);

    WarpFlatRing(
      track1,
      modulate(Math.pow(lowerMaxFr, 0.8), 0, 1, 0, 8),
      modulate(upperAvgFr, 0, 1, 0, 4)
    );
    WarpFlatRing(
      track2,
      modulate(Math.pow(lowerMaxFr, 0.6), 0, 1, 0, 6),
      modulate(upperAvgFr, 0, 1, 0, 3)
    );
    WarpFlatRing(
      track3,
      modulate(Math.pow(lowerMaxFr, 0.4), 0, 1, 0, 4),
      modulate(upperAvgFr, 0, 1, 0, 2)
    );
    WarpFlatRing(
      track4,
      modulate(Math.pow(lowerMaxFr, 0.3), 0, 1, 0, 3),
      modulate(upperAvgFr, 0, 1, 0, 1.5)
    );
    WarpFlatRing(
      track5,
      modulate(Math.pow(lowerMaxFr, 0.2), 0, 1, 0, 2),
      modulate(upperAvgFr, 0, 1, 0, 1)
    );

    // Update character animations with consistent timing (only first 4 characters)
    const fixedDelta = 1 / 60; // 60 FPS equivalent

    for (let i = 0; i < Math.min(mixers.length, 4); i++) {
      if (mixers[i]) {
        mixers[i].update(fixedDelta);
      }
    }

    // Apply audio-reactive effects to visible character
    const visibleCharacter = characters[currentStep];
    if (visibleCharacter && visibleCharacter.visible) {
      // Reset any transformations that might have been inherited
      visibleCharacter.rotation.x = 0;
      visibleCharacter.rotation.z = 0;

      // Make character scale slightly with bass (more subtle)
      const bassIntensity = modulate(lowerMaxFr, 0, 1, 0.95, 1.05);
      const baseScale = 0.3;
      visibleCharacter.scale.set(
        baseScale * bassIntensity,
        baseScale * bassIntensity,
        baseScale * bassIntensity
      );

      // Add very subtle rotation based on treble
      visibleCharacter.rotation.y += modulate(upperAvgFr, 0, 1, 0, 0.005);

      // Keep character at same level as rings
      visibleCharacter.position.set(0, 20, 0);
    }

    // Load dance characters after first render
    if (!charactersLoaded) {
      charactersLoaded = true;
      // Use setTimeout to ensure this happens after the first render
      setTimeout(() => {
        loadDanceCharacters();
      }, 100);
    }

    requestAnimationFrame(render);
    renderer.render(scene, camera);
  }

  // Warping function for flat ring (band)
  function WarpFlatRing(mesh, bassFr, treFr) {
    const positions = mesh.geometry.attributes.position;
    const amp = 1.5;
    const time = window.performance.now();
    const rf = 0.0005;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);

      // Animate the z (vertical) position for a flat undulation
      const angle = Math.atan2(y, x);
      const undulation =
        Math.sin(angle * 7 + time * rf) * bassFr +
        Math.cos(angle * 14 + time * rf * 1.5) * treFr +
        noise.noise3D(x * 0.1, y * 0.1, time * rf) * amp * treFr * 0.5;

      positions.setZ(i, undulation * 1.2);
    }

    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
  render();
}

function fractionate(val, minVal, maxVal) {
  return (val - minVal) / (maxVal - minVal);
}

function modulate(val, minVal, maxVal, outMin, outMax) {
  var fr = fractionate(val, minVal, maxVal);
  var delta = outMax - outMin;
  return outMin + fr * delta;
}

function avg(arr) {
  var total = arr.reduce(function (sum, b) {
    return sum + b;
  });
  return total / arr.length;
}

function max(arr) {
  return arr.reduce(function (a, b) {
    return Math.max(a, b);
  });
}
