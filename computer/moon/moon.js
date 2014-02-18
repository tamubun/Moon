'use strict';
var debug = false;

var scenes = [], renderers = [], cameras = [], controls = [];
var e1 = new THREE.Vector3(1,0,0),
    e2 = new THREE.Vector3(0,1,0),
    e3 = new THREE.Vector3(0,0,1),
    zero = new THREE.Vector3(0,0,0),
    earth_th = 23.4 / 180.0 * Math.PI,
    earth_axis = new THREE.Vector3(0,Math.sin(earth_th),Math.cos(earth_th)),
    moon_th = 5.1 / 180.0 * Math.PI;
var celestial,      // 天球
    sun_trajectory,
    moon_trajectory,
    sun, moon,
    cel_radius = 200;
var ground, earth, moon1,
    arena1_scale = 200,
    earth_radius = arena1_scale / 2.5,
    sun_light, moons_path;

/* 黄道座標系(arena1の座標系)から見た成分vで表されるベクトルの方向にある星を
   赤道上にある地表Pから見た時の
     th: 南中時の天頂角(南が正)
     phi: Pが春分点を向いている時に天の北極回りの回転角(天頂方向が0、東が正)
   で表現する。正午からphiに相当する時間だけ巻き戻せば、その星がPで南中する */
function eclipticToGround(v) {
  var v2 = v.clone().applyAxisAngle(e1, earth_th), // 赤道座標から見た成分
      th, phi;
  th = -Math.asin(v2.z);
  v2.setZ(0).normalize();
  phi = Math.acos(v2.x);
  if ( v2.y < 0 )
    phi = -phi;
  return { th: th, phi: phi };
}

function newSettings() {
  var latitude = $('#latitude').val() / 180.0 * Math.PI,
      year_phase = $('#date').val()/365.0*2*Math.PI,
      date_phase = $('#time').val()/24.0*2*Math.PI - Math.PI,
      lunar_phase = $('#lunar-phase').val()/360*2*Math.PI,
      node_phase =  $('#node').val()/180*Math.PI,
      angles = eclipticToGround(e1.clone().applyAxisAngle(e3, year_phase)),
      q = new THREE.Quaternion();

  q.setFromAxisAngle(e2, -date_phase);
  celestial.quaternion.setFromAxisAngle(e1, latitude);
  celestial.quaternion.multiply(q);
  sun_trajectory.scale.set(
    cel_radius * Math.cos(angles.th), 1, cel_radius * Math.cos(angles.th));
  sun_trajectory.position.y = -cel_radius * Math.sin(angles.th);
  sun.position.set(
    0, -cel_radius * Math.sin(angles.th), cel_radius * Math.cos(angles.th));

  ground.position.set(
    earth_radius * Math.cos(latitude), 0, earth_radius * Math.sin(latitude));
  ground.rotation.set(0, Math.PI/2-latitude, 0);
  earth.quaternion.setFromAxisAngle(e3, angles.phi + date_phase);
  earth.rotation.x = -earth_th;
  sun_light.position.set(
    arena1_scale * 1.8 * Math.cos(year_phase),
    arena1_scale * 1.8 * Math.sin(year_phase),
    0);

  q.setFromAxisAngle(e1, moon_th);
  moons_path.quaternion.setFromAxisAngle(e3, -node_phase).multiply(q);
  var d = lunar_phase + node_phase + year_phase, // 昇交点と月との黄経差
      psi,      // 昇交点からの月の軌道上での回転角
      moon_vec; // 月の方向 (arena1での座標系)
  d = d - 2*Math.PI * Math.floor(d/2.0/Math.PI);
  if ( Math.abs(Math.cos(d)) < 0.001 )
    psi = Math.PI / 2;
  else
    psi = Math.atan(Math.tan(d) / Math.cos(moon_th));
  if ( d > Math.PI/2 && d <= Math.PI * 3.0/2.0 )
    psi = Math.PI + psi;
  q.setFromAxisAngle(e3, psi);
  q.multiplyQuaternions(moons_path.quaternion, q);
  moon_vec = e1.clone().applyQuaternion(q);
  moon1.position.set(
    1.4 * arena1_scale * moon_vec.x,
    1.4 * arena1_scale * moon_vec.y,
    1.4 * arena1_scale * moon_vec.z);
  var moon_angles = eclipticToGround(moon_vec);
  moon_trajectory.scale.set(
    cel_radius * 0.95 * Math.cos(moon_angles.th),
    1,
    cel_radius * 0.95 * Math.cos(moon_angles.th));
  moon_trajectory.position.y = -cel_radius * 0.95 * Math.sin(moon_angles.th);
  moon.position.set(
    cel_radius * 0.95 * Math.cos(moon_angles.th) *
      Math.sin(moon_angles.phi - year_phase),
    -cel_radius * 0.95 * Math.sin(moon_angles.th),
    cel_radius * 0.95 * Math.cos(moon_angles.th) *
      Math.cos(moon_angles.phi - year_phase));
}

function showLabels0() {
  var material = new THREE.MeshBasicMaterial({color: 'black'}),
      text, zenith,
      scene = scenes[0];

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'N', {size:30, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(0, cel_radius+40, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'S', {size:30, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(0, -cel_radius-15, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'E', {size:30, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(cel_radius+30, 0, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'W', {size:30, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(-cel_radius-30, 0, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  zenith = new THREE.Mesh(
    new THREE.SphereGeometry(2),
    material);
  zenith.position.set(0, 0, cel_radius);
  scene.add(zenith);
}

function showLabels1(plane) {
  var material = new THREE.MeshBasicMaterial({color: 'black'}),
      text,
      scene = scenes[1];

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'N', {size:15, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(-arena1_scale*0.28, 0, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'S', {size:15, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(arena1_scale*0.35, 0, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'E', {size:15, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(0, arena1_scale*0.3, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'W', {size:15, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(0, -arena1_scale*0.37, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);
}

/* arena0 の初期設定 */
function init0() {
  var arena = $('#arena0'),
      scene = new THREE.Scene(),
      renderer = new THREE.WebGLRenderer({ antialias: true }),
      camera = new THREE.PerspectiveCamera(
        45, arena.innerWidth() / arena.innerHeight(), 1, 2000),
      control = new THREE.TrackballControls(camera, arena[0]);

  scenes.push(scene);
  renderers.push(renderer);
  cameras.push(camera);
  controls.push(control);

  camera.position.set(850, 50, 400); // x: 画面手前向き, y: 右向き, z: 上向き
  camera.up = e3.clone();

  control.rotateSpeed = 1.0;
  control.zoomSpeed = 1.2;
  control.panSpeed = 0.8;
  control.noZoom = false;
  control.noPan = false;
  control.staticMoving = true;
  control.dynamicDampingFactor = 0.3;
  control.enabled = true;

  celestial = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius,30,20),
    new THREE.MeshLambertMaterial(
      { color: 'blue', transparent: true, opacity: 0.1 }));
  scene.add(celestial);

  var polaris = new THREE.Mesh(        // 天の北極
    new THREE.TetrahedronGeometry(8),
    new THREE.MeshLambertMaterial({ color: 'yellow'}));
  polaris.position.y = cel_radius*1.5;
  celestial.add(polaris);
  polaris = polaris.clone();
  polaris.rotation.z = Math.PI/2;
  celestial.add(polaris);

  var material = new THREE.LineBasicMaterial({ color: 0xaaaacc }),
      geo = new THREE.Geometry(),
      trajectory, i, th;

  for ( i = 0; i < 41; ++i ) {
    th = 2*Math.PI / 40 * i;
    geo.vertices.push(new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
  }
  var circle = new THREE.Line(geo, material);

  // 春分、秋分
  trajectory = circle.clone();
  trajectory.scale.set(cel_radius, 1, cel_radius);
  celestial.add(trajectory);

  // 夏至
  trajectory = circle.clone();
  trajectory.scale.set(
    cel_radius * Math.cos(earth_th), 1, cel_radius * Math.cos(earth_th));
  trajectory.position.y = cel_radius * Math.sin(earth_th)
  celestial.add(trajectory);

  // 冬至
  trajectory = circle.clone();
  trajectory.scale.set(
    cel_radius * Math.cos(earth_th), 1, cel_radius * Math.cos(earth_th));
  trajectory.position.y = -cel_radius * Math.sin(earth_th)
  celestial.add(trajectory);

  // 指定した日の太陽の軌跡と月の軌跡
  sun_trajectory = new THREE.Line(
    geo, new THREE.LineBasicMaterial({ color: 0xff7777, linewidth: 3}));
  celestial.add(sun_trajectory);
  moon_trajectory = new THREE.Line(
    geo, new THREE.LineBasicMaterial({ color: 'white', linewidth: 2}));
  celestial.add(moon_trajectory);

  sun = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius*0.1, cel_radius*0.1, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'yellow', emissive: 0xffff40 }));
  celestial.add(sun);

  moon = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius*0.07, cel_radius*0.07, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'gray' }));
  celestial.add(moon);

  var ground0 = new THREE.Mesh(
    new THREE.CubeGeometry(600, 600,cel_radius * 1.1),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 0xaa7744, transparent: true, opacity: 0.9 }));
  ground0.position.z = -cel_radius*1.1/2;
  scene.add(ground0);

  showLabels0();

  var light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0,0,50);
  light.target = ground0;
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040));

  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  $('#arena0').append(renderer.domElement);
}

/* arena1 の初期設定 */
function init1() {
  var arena = $('#arena1'),
      scene = new THREE.Scene(),
      renderer = new THREE.WebGLRenderer({ antialias: true }),
      camera = new THREE.PerspectiveCamera(
        45, arena.innerWidth() / arena.innerHeight(), 1, 2000),
      control = new THREE.TrackballControls(camera, arena[0]);

  scenes.push(scene);
  renderers.push(renderer);
  cameras.push(camera);
  controls.push(control);

  camera.position.set(900, 50, 200); // x: 画面手前向き, y: 右向き, z: 上向き
  camera.up = e3.clone();

  control.target.z = 80;
  control.rotateSpeed = 1.0;
  control.zoomSpeed = 1.2;
  control.panSpeed = 0.8;
  control.noZoom = false;
  control.noPan = false;
  control.staticMoving = true;
  control.dynamicDampingFactor = 0.3;
  control.enabled = true;

  var polaris = new THREE.Mesh(        // 天の北極
    new THREE.TetrahedronGeometry(8),
    new THREE.MeshLambertMaterial({ color: 'yellow'}));
  polaris.position.set(
    0,
    arena1_scale * 0.7 * Math.sin(earth_th),
    arena1_scale * 0.7 * Math.cos(earth_th));
  scene.add(polaris);
  polaris = polaris.clone();
  polaris.rotation.z = Math.PI/2;
  scene.add(polaris);

  earth = new THREE.Object3D();
  scene.add(earth);
  var texture = THREE.ImageUtils.loadTexture(
        '/computer/moon/land_ocean_ice_cloud_2048.jpeg'),
      sphere = new THREE.Mesh(
        new THREE.SphereGeometry(earth_radius, 30, 20),
        new THREE.MeshLambertMaterial({ map: texture, overdraw: true }));
  sphere.rotation.set(Math.PI/2, Math.PI/0.8, 0);
  earth.add(sphere);

  var material = new THREE.LineBasicMaterial({ color: 0xaaaacc }),
      geo = new THREE.Geometry(),
      trajectory, i, th, circle;

  for ( i = 0; i < 41; ++i ) {
    th = 2*Math.PI / 40 * i;
    geo.vertices.push(new THREE.Vector3(Math.cos(th), Math.sin(th), 0));
  }
  circle = new THREE.Line(geo, material);

  // 赤道
  trajectory = circle.clone();
  trajectory.scale.set(earth_radius, earth_radius, 1);
  earth.add(trajectory);

  // 北回帰線
  trajectory = circle.clone();
  trajectory.scale.set(
    earth_radius * Math.cos(earth_th), earth_radius * Math.cos(earth_th), 1);
  trajectory.position.z = earth_radius * Math.sin(earth_th);
  earth.add(trajectory);

  // 南回帰線
  trajectory = circle.clone();
  trajectory.scale.set(
    earth_radius * Math.cos(earth_th), earth_radius * Math.cos(earth_th), 1);
  trajectory.position.z = -earth_radius * Math.sin(earth_th);
  earth.add(trajectory);

  // 黄道
  trajectory = circle.clone();
  trajectory.scale.set(
    arena1_scale * 1.8, arena1_scale * 1.8, 1);
  scene.add(trajectory);

  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(arena1_scale*0.8, arena1_scale*0.8),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 0xaa7744, transparent: true, opacity: 0.9 }));
  var ground_back = new THREE.Mesh(
    new THREE.PlaneGeometry(arena1_scale*0.8, arena1_scale*0.8),
    new THREE.MeshLambertMaterial({ color: 'black' }));
  ground_back.rotation.x = Math.PI;
  ground.add(ground_back);
  earth.add(ground);

  showLabels1(ground);

  sun_light = new THREE.DirectionalLight(0xffffff, 1.2);
  sun_light.target = earth;
  scene.add(sun_light);
  scene.add(new THREE.AmbientLight(0x101010));

  var sun1 = new THREE.Mesh(
    new THREE.SphereGeometry(arena1_scale*0.1, arena1_scale*0.1, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'yellow', emissive: 0xffff40 }));
  sun1.position = sun_light.position;
  scene.add(sun1);

  // 白道
  moons_path = new THREE.Object3D();
  scene.add(moons_path);
  trajectory = circle.clone();
  trajectory.scale.set(
    arena1_scale * 1.4, arena1_scale * 1.4, 1);
  moons_path.add(trajectory);

  // 昇交点
  var node = new THREE.Mesh(
    new THREE.SphereGeometry(3, 30, 20),
    new THREE.MeshLambertMaterial({ color: 'black' }));
  node.position.x = arena1_scale * 1.4;
  moons_path.add(node);

  moon1 = new THREE.Mesh(
    new THREE.SphereGeometry(arena1_scale*0.07, 30, 20),
    new THREE.MeshLambertMaterial({ color: 'gray' }));
  moon1.position.x = arena1_scale * 1.4;
  scene.add(moon1);

  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  $('#arena1').append(renderer.domElement);
}

function animate() {
  requestAnimationFrame(animate);
  for ( var i = 0; i < 2; ++i ) {
    controls[i].update();
    renderers[i].render(scenes[i], cameras[i]);
  }
}

$(function() {
  $('.settings').change(newSettings);

  init0();
  init1();

  newSettings();

  animate();
});
