const audioInput = document.getElementById("audio");
let noise = new SimplexNoise();
const area = document.getElementById("visualizer");
const label = document.getElementById("label");
const stepDisplay = document.getElementById("step-display");
const bpmDisplay = document.getElementById("bpm-display");
const audioSelector = document.getElementById("audio-selector");
const audioInfo = document.getElementById("audio-info");
const filenameDisplay = document.getElementById("filename-display");
const resetBtn = document.getElementById("reset-btn");
audioInput.addEventListener("change", setAudio, false);
resetBtn.addEventListener("click", resetApp, false);
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
let bpmHistory = [];
let dynamicThresholds = { slow: 0, medium: 0, fast: 0, veryFast: 0 };
let isCalibrating = true;
let calibrationStartTime = 0;
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

// Enhanced beat detection with dynamic BPM analysis
function setupBeatDetector(audioSource) {
  const beatAnalyser = audioContext.createAnalyser();
  audioSource.connect(beatAnalyser);
  beatAnalyser.fftSize = 512;

  const dataArray = new Uint8Array(beatAnalyser.frequencyBinCount);
  let lastBeat = 0;
  let beatHistory = [];
  let energyHistory = [];
  
  // Reset calibration for new track
  isCalibrating = true;
  calibrationStartTime = audioContext.currentTime;
  bpmHistory = [];
  
  setInterval(() => {
    beatAnalyser.getByteFrequencyData(dataArray);

    const bassEnd = Math.floor(
      (60 * beatAnalyser.frequencyBinCount) / (audioContext.sampleRate / 2)
    );
    let bassEnergy = 0;
    for (let i = 0; i < bassEnd; i++) {
      bassEnergy += dataArray[i];
    }
    bassEnergy = bassEnergy / bassEnd;

    energyHistory.push(bassEnergy);
    if (energyHistory.length > 100) energyHistory.shift();

    const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
    const threshold = avgEnergy * 1.3;

    const now = audioContext.currentTime;
    if (bassEnergy > threshold && now - lastBeat > 0.25) {
      beatHistory.push(now);
      lastBeat = now;
      beatCount++;

      if (beatHistory.length > 4) {
        beatHistory = beatHistory.slice(-10);
        const intervals = [];
        for (let i = 1; i < beatHistory.length; i++) {
          intervals.push(beatHistory[i] - beatHistory[i - 1]);
        }
        
        // Use median instead of average for more stable BPM
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        const estimatedBPM = 60 / medianInterval;

        if (estimatedBPM >= 30 && estimatedBPM <= 200) {
          currentTempo = estimatedBPM;
          
          // Update BPM display
          bpmDisplay.textContent = `BPM: ${Math.round(estimatedBPM)}`;
          
          // Collect BPM data during calibration period
          if (isCalibrating && now - calibrationStartTime < 30) {
            bpmHistory.push(estimatedBPM);
            if (bpmHistory.length > 50) bpmHistory.shift();
          } else if (isCalibrating) {
            // Calibration complete - calculate dynamic thresholds
            calculateDynamicThresholds();
            isCalibrating = false;
          }
          
          updateDanceStepFromTempo(estimatedBPM);
        }
      }
    }
  }, 40);
}

// Calculate dynamic thresholds based on track's BPM distribution
function calculateDynamicThresholds() {
  if (bpmHistory.length < 10) {
    // Fallback to default thresholds if insufficient data
    dynamicThresholds = { slow: 70, medium: 90, fast: 120, veryFast: 150 };
    return;
  }
  
  // Sort BPM values and calculate percentiles
  const sortedBPM = [...bpmHistory].sort((a, b) => a - b);
  const min = sortedBPM[0];
  const max = sortedBPM[sortedBPM.length - 1];
  const range = max - min;
  
  // Use weighted distribution based on musical characteristics
  if (range < 20) {
    // Narrow range - likely consistent tempo track
    const center = (min + max) / 2;
    dynamicThresholds.slow = center - 8;
    dynamicThresholds.medium = center - 3;
    dynamicThresholds.fast = center + 3;
    dynamicThresholds.veryFast = center + 8;
  } else {
    // Wide range - variable tempo track
    // Use 25th, 50th, 75th percentiles with musical weighting
    const q1 = sortedBPM[Math.floor(sortedBPM.length * 0.25)];
    const median = sortedBPM[Math.floor(sortedBPM.length * 0.5)];
    const q3 = sortedBPM[Math.floor(sortedBPM.length * 0.75)];
    
    dynamicThresholds.slow = Math.max(min + range * 0.15, q1 - 5);
    dynamicThresholds.medium = Math.max(q1 + 5, median - 10);
    dynamicThresholds.fast = Math.max(median + 5, q3 - 8);
    dynamicThresholds.veryFast = Math.max(q3 + 3, max - range * 0.1);
  }
  
  console.log('Dynamic thresholds calculated:', dynamicThresholds);
}

// Enhanced dance step selection with dynamic thresholds
function updateDanceStepFromTempo(bpm) {
  let targetStep;
  
  // Use dynamic thresholds if available, otherwise fallback
  const thresholds = isCalibrating ? 
    { slow: 70, medium: 90, fast: 120, veryFast: 150 } : 
    dynamicThresholds;
  
  if (bpm >= thresholds.veryFast) {
    targetStep = 3; // Very high tempo - most energetic
  } else if (bpm >= thresholds.fast) {
    targetStep = 3; // High tempo - energetic dancing
  } else if (bpm >= thresholds.medium) {
    targetStep = 2; // Medium tempo - moderate dancing
  } else if (bpm >= thresholds.slow) {
    targetStep = 1; // Slow tempo - gentle movements
  } else {
    targetStep = 0; // Very slow or unclear tempo - idle
  }

  // Add hysteresis to prevent rapid switching
  const currentThreshold = getCurrentThreshold(currentStep, thresholds);
  const hysteresis = 5; // BPM buffer to prevent oscillation
  
  if (targetStep > currentStep && bpm > currentThreshold + hysteresis) {
    switchToStep(targetStep);
  } else if (targetStep < currentStep && bpm < currentThreshold - hysteresis) {
    switchToStep(targetStep);
  }
}

// Helper function to get current step's threshold
function getCurrentThreshold(step, thresholds) {
  switch(step) {
    case 0: return thresholds.slow;
    case 1: return thresholds.medium;
    case 2: return thresholds.fast;
    case 3: return thresholds.veryFast;
    default: return thresholds.slow;
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
  
  // Update step display
  stepDisplay.textContent = `Step: ${stepIndex}`;
}

function setAudio() {
  audio.pause();
  const audioFile = this.files[0];
  if (audioFile.type.startsWith("audio/")) {
    const audioURL = URL.createObjectURL(audioFile);
    audio = new Audio(audioURL);
    
    // Update UI to show filename and hide selector
    filenameDisplay.textContent = audioFile.name;
    audioSelector.style.display = "none";
    audioInfo.style.display = "flex";
    
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
  bpmDisplay.textContent = "BPM: --"; // Reset BPM display
  stopStepProgression();
});

// Beat-reactive step progression with calibration reset
function startStepProgression() {
  // Reset all tracking variables for new song
  beatCount = 0;
  currentTempo = 0;
  bpmHistory = [];
  isCalibrating = true;
  calibrationStartTime = audioContext ? audioContext.currentTime : 0;

  switchToStep(0);

  if (stepProgressionInterval) clearInterval(stepProgressionInterval);

  stepProgressionInterval = setInterval(() => {
    // Enhanced fallback with calibration awareness
    if (analyser) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate bass and treble energy for better tempo estimation
      const bassEnd = Math.floor(dataArray.length * 0.25);
      const bassEnergy = dataArray.slice(0, bassEnd).reduce((sum, val) => sum + val, 0) / bassEnd;
      const trebleEnergy = dataArray.slice(bassEnd).reduce((sum, val) => sum + val, 0) / (dataArray.length - bassEnd);
      
      // Use energy patterns to estimate tempo during calibration
      if (isCalibrating && currentTempo === 0) {
        const totalEnergy = (bassEnergy + trebleEnergy) / 2;
        let estimatedBPM;
        
        if (totalEnergy > 120) {
          estimatedBPM = 140; // High energy suggests fast tempo
        } else if (totalEnergy > 80) {
          estimatedBPM = 110; // Medium energy
        } else if (totalEnergy > 40) {
          estimatedBPM = 85; // Low-medium energy
        } else {
          estimatedBPM = 65; // Low energy
        }
        
        // Add some variation based on treble/bass ratio
        const ratio = trebleEnergy / (bassEnergy + 1);
        if (ratio > 1.5) estimatedBPM += 10; // Treble-heavy = faster
        if (ratio < 0.7) estimatedBPM -= 8; // Bass-heavy = potentially slower
        
        // Update BPM display for fallback estimation too
        bpmDisplay.textContent = `BPM: ${Math.round(estimatedBPM)}`;
        updateDanceStepFromTempo(estimatedBPM);
      }
    }
  }, 1000);
}

function stopStepProgression() {
  if (stepProgressionInterval) {
    clearInterval(stepProgressionInterval);
    stepProgressionInterval = null;
  }
}

// Reset the entire application
function resetApp() {
  // Stop and reset audio
  audio.pause();
  audio.currentTime = 0;
  audio = new Audio("");
  
  // Reset UI elements
  audioSelector.style.display = "flex";
  audioInfo.style.display = "none";
  filenameDisplay.textContent = "";
  audioInput.value = ""; // Clear file input
  label.style.display = "flex";
  
  // Reset displays
  stepDisplay.textContent = "Step: 0";
  bpmDisplay.textContent = "BPM: --";
  
  // Reset all tracking variables
  currentStep = 0;
  currentTempo = 0;
  beatCount = 0;
  bpmHistory = [];
  isCalibrating = true;
  calibrationStartTime = 0;
  dynamicThresholds = { slow: 0, medium: 0, fast: 0, veryFast: 0 };
  
  // Stop progression and close audio context
  stopStepProgression();
  if (audioContext) {
    audioContext.close();
    audioContext = null;
    analyser = null;
  }
  
  // Reset character visibility
  if (characters.length > 0) {
    for (let i = 0; i < Math.min(characters.length, 4); i++) {
      if (characters[i]) {
        characters[i].visible = i === 0; // Only step0 visible
      }
    }
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
