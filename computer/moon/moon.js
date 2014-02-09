'use strict';
var debug = false;

var camera, scene, renderer, controls;
var latitude;
var e1 = new THREE.Vector3(1,0,0),
    e2 = new THREE.Vector3(0,1,0),
    e3 = new THREE.Vector3(0,0,1),
    zero = new THREE.Vector3(0,0,0);
var sun_trajectory;

function newSettings() {
  latitude = $('#latitude').val() / 180.0 * Math.PI;
  sun_trajectory.quaternion.setFromAxisAngle(e2, Math.PI/2 - latitude);
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

  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 0xaa7744, transparent: true, opacity: 0.9 }));
  ground.material.side = THREE.DoubleSide;
  ground.quaternion.setFromAxisAngle(e1, Math.PI);
  scene.add(ground);

  var dome = new THREE.Mesh(
    new THREE.SphereGeometry(250,30,20, 0, Math.PI),
    new THREE.MeshLambertMaterial(
      { color: "blue", transparent: true, opacity: 0.1 }));
  scene.add(dome);

  sun_trajectory = new THREE.Mesh(
    new THREE.TorusGeometry(250,1,3,50),
    new THREE.MeshLambertMaterial());
  scene.add(sun_trajectory);

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
