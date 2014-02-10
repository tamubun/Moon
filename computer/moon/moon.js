'use strict';
var debug = false;

var camera, scene, renderer, controls;
var latitude;
var e1 = new THREE.Vector3(1,0,0),
    e2 = new THREE.Vector3(0,1,0),
    e3 = new THREE.Vector3(0,0,1),
    zero = new THREE.Vector3(0,0,0),
    radius = 200;
var celestial; // 天球

function newSettings() {
  latitude = $('#latitude').val() / 180.0 * Math.PI;
  celestial.quaternion.setFromAxisAngle(e2, Math.PI/2 - latitude);
}

function init() {
  var arena = $('#arena');
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    45, arena.innerWidth() / arena.innerHeight(), 1, 2000);
  camera.position.set(0, -700, 350);
  camera.up = e3.clone();
  camera.lookAt(scene.position);
  controls = new THREE.TrackballControls(camera, arena[0]);
  controls.rotateSpeed = 1.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.noZoom = false;
  controls.noPan = false;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;
  controls.enabled = true;

  scene.add(new THREE.AmbientLight(0x404040));

  celestial = new THREE.Mesh(
    new THREE.SphereGeometry(radius,30,20),
    new THREE.MeshLambertMaterial(
      { color: "blue", transparent: true, opacity: 0.1 }));
  scene.add(celestial);

  var polaris = new THREE.Mesh(        // 天の北極
    new THREE.SphereGeometry(5), 
    new THREE.MeshLambertMaterial({ color: "black"}));
  polaris.position.z = radius;
  celestial.add(polaris);

  var material = new THREE.MeshLambertMaterial();

  var sun_trajectory = new THREE.Mesh( // 春分、秋分
    new THREE.TorusGeometry(radius,1,3,50), 
    material);
  celestial.add(sun_trajectory);

  sun_trajectory = new THREE.Mesh(     // 夏至
    new THREE.TorusGeometry(radius * Math.cos(23.4/180*Math.PI),1,3,50),
    material);
  celestial.add(sun_trajectory);
  sun_trajectory.position.z = radius * Math.sin(23.4/180*Math.PI)

  sun_trajectory = new THREE.Mesh(     // 冬至
    new THREE.TorusGeometry(radius * Math.cos(23.4/180*Math.PI),1,3,50),
    material);
  celestial.add(sun_trajectory);
  sun_trajectory.position.z = -radius * Math.sin(23.4/180*Math.PI)

  var ground = new THREE.Mesh(
    new THREE.CubeGeometry(600, 600,radius * 1.1),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 0xaa7744, transparent: true, opacity: 0.9 }));
  ground.quaternion.setFromAxisAngle(e1, Math.PI);
  scene.add(ground);
  ground.position.z = -105;

  var light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0,0,50);
  light.castShadow = true;
  light.shadowMapWidth = 2048;
  light.shadowMapHeight = 2048;
  light.target = ground;
  scene.add(light);

  newSettings();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  renderer.shadowMapEnabled = true;
  $('#arena').append(renderer.domElement);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

$(function() {
  $('.settings').change(newSettings);

  init();
  animate();
});
