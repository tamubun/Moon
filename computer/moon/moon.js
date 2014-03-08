'use strict';
var debug = false,
    helper;
var animate, unloaded_texture;
var scenes = [], renderers = [], cameras = [], controls = [];
var e1 = new THREE.Vector3(1,0,0),
    e2 = new THREE.Vector3(0,1,0),
    e3 = new THREE.Vector3(0,0,1),
    zero = new THREE.Vector3(0,0,0),
    earth_th = 23.4 / 180.0 * Math.PI,
    earth_axis = new THREE.Vector3(0,Math.sin(earth_th),Math.cos(earth_th)),
    moon_th = 5.1 / 180.0 * Math.PI,   // 黄道に対する月の公転軸の傾き
    moon_th2 = -1.5 / 180.0 * Math.PI; // 黄道に対する月の自転軸の傾き(未使用)
var celestial,      // 天球
    sun_trajectory,
    ecliptic,
    sun0, moon0,
    cel_radius = 200;
var ground1, earth1, moon1,
    arena1_scale = 200,
    earth_radius = arena1_scale / 2.5,
    sun_light1, moons_path;
var sun2, earth2, moon2, sun_light2, ambient;

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

/* d = 0を春分の日(3/20に固定)として、任意の d に対応する月日を返す */
var months = [31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28];
function calcDate(d) {
  var m, attr;

  if ( d === 0 || d === 365 )
    attr = ' (春分)';
  else if ( d === Math.floor(0.5+365/2.0) )
    attr = ' (秋分)';
  else if ( d === Math.floor(0.5+365/4.0) )
    attr = ' (夏至)';
  else if ( d === Math.floor(0.5+365/4.0*3.0) )
    attr = ' (冬至)';
  else
    attr = '';

  d += 19;
  for ( m = 0; m < 12; ++m ) {
    if ( d < months[m] )
      break;
    d -= months[m];
  }
  if ( m > 9 )
    m-=12;
  return ""+(m+3)+"/"+(d+1) + attr;
}

function newSettings() {
  var latitude = $('#latitude').val() / 180.0 * Math.PI,
      year_phase = $('#date').val()/365.0*2*Math.PI,
      date_phase = $('#time').val()/24.0*2*Math.PI - Math.PI,
      lunar_phase = $('#lunar-phase').val()/360*2*Math.PI,
      node_phase =  $('#node').val()/180*Math.PI,
      angles,
      q = new THREE.Quaternion(),
      v = new THREE.Vector3();

  $('#date-label').text('日付: ' + calcDate(+$('#date').val()));
  lunar_phase +=
    (+$('#date').val()+($('#time').val()-12)/24.0)/29.5306*2*Math.PI;
  year_phase +=
    ($('#time').val()-12)/24.0/365.0*2*Math.PI;
  angles = eclipticToGround(e1.clone().applyAxisAngle(e3, year_phase));

  q.setFromAxisAngle(e2, -date_phase);
  celestial.quaternion.setFromAxisAngle(e1, latitude);
  celestial.quaternion.multiply(q);
  sun_trajectory.scale.set(
    Math.cos(angles.th) * cel_radius, 1, Math.cos(angles.th) * cel_radius);
  sun_trajectory.position.y = -Math.sin(angles.th) * cel_radius;
  sun0.position.set(
    0, -Math.sin(angles.th) * cel_radius, Math.cos(angles.th) * cel_radius);
  ecliptic.rotation.set(0,-angles.phi, earth_th);

  ground1.position.set(
    Math.cos(latitude) * earth_radius, 0, Math.sin(latitude) * earth_radius);
  ground1.rotation.set(0, Math.PI/2-latitude, 0);
  earth1.quaternion.setFromAxisAngle(e3, angles.phi + date_phase);
  earth1.rotation.x = -earth_th;
  sun_light1.position.set(
    Math.cos(year_phase) * arena1_scale * 1.8,
    Math.sin(year_phase) * arena1_scale * 1.8,
    0);

  q.setFromAxisAngle(e1, moon_th);
  moons_path.quaternion.setFromAxisAngle(e3, -node_phase).multiply(q);
  var d = lunar_phase + node_phase + year_phase, // 昇交点と月との黄経差
      psi,      // 昇交点からの月の軌道上での回転角
      moon_vec; // 月の方向 (arena1での座標系)
  d = d - 2*Math.PI * Math.floor(d/2.0/Math.PI);
  if ( Math.abs(Math.cos(d)) < 0.001 ) {
    psi = Math.sin(d) > 0 ? Math.PI / 2 : Math.PI * 1.5;
  } else {
    psi = Math.atan(Math.tan(d) / Math.cos(moon_th));
    if ( d > Math.PI/2 && d <= Math.PI * 1.5 )
      psi = Math.PI + psi;
  }
  q.setFromAxisAngle(e3, psi);
  q.multiplyQuaternions(moons_path.quaternion, q);
  moon_vec = e1.clone().applyQuaternion(q);
  moon1.position.set(
    1.4 * arena1_scale * moon_vec.x,
    1.4 * arena1_scale * moon_vec.y,
    1.4 * arena1_scale * moon_vec.z);
  var moon_angles = eclipticToGround(moon_vec);
  v.set(
    Math.cos(moon_angles.th) * Math.sin(moon_angles.phi - angles.phi),
    -Math.sin(moon_angles.th),
    Math.cos(moon_angles.th) * Math.cos(moon_angles.phi - angles.phi));
  moon0.position = v.clone().applyQuaternion(celestial.quaternion).multiplyScalar(cel_radius * 0.95);

  moon2.position =
    v.clone().applyQuaternion(celestial.quaternion).multiplyScalar(20);
  /* arena0座標で、赤道上からみて月の北極が向いている方向を定める。
     月は、その軸回りを自転する。
     月の北極は、黄道軸と一致していると近似。ほんとは moon_th2傾いてる */
  var moon_axis_angles = eclipticToGround(e3),
      n = new THREE.Vector3( // 月の北極をこちらに向ければいい
        Math.cos(moon_axis_angles.th) *
	  Math.sin(moon_axis_angles.phi - year_phase),
       -Math.sin(moon_axis_angles.th),
        Math.cos(moon_axis_angles.th) *
	  Math.cos(moon_axis_angles.phi - year_phase)),
       m = new THREE.Matrix4();
  m.lookAt(n, zero, e1); // Object3D.lookAt()のソースから
  moon0.quaternion.setFromRotationMatrix(m);
  moon0.rotateOnAxis(e1, Math.PI/2);
  moon0.rotateOnAxis(e2, Math.PI + lunar_phase);
  moon0.quaternion.multiplyQuaternions(celestial.quaternion, moon2.quaternion);

  sun_light2.position
    .set(0, -Math.sin(angles.th), Math.cos(angles.th))
    .applyQuaternion(celestial.quaternion);

  sun2.position
    .set(0, -Math.sin(angles.th), Math.cos(angles.th))
    .applyQuaternion(celestial.quaternion)
    .multiplyScalar(40);

  cameras[2].lookAt(moon2.position);
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

  var polaris0 = new THREE.Mesh(        // 天の北極
    new THREE.OctahedronGeometry(5),
    new THREE.MeshLambertMaterial({ color: 'gold', emissive: 0x999933 }));
  polaris0.position.y = cel_radius;
  celestial.add(polaris0);

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
    Math.cos(earth_th) * cel_radius, 1, Math.cos(earth_th) * cel_radius);
  trajectory.position.y = Math.sin(earth_th) * cel_radius;
  celestial.add(trajectory);

  // 冬至
  trajectory = circle.clone();
  trajectory.scale.set(
    Math.cos(earth_th) * cel_radius, 1, Math.cos(earth_th) * cel_radius);
  trajectory.position.y = -Math.sin(earth_th) * cel_radius;
  celestial.add(trajectory);

  // 黄道
  ecliptic =  new THREE.Line(
    geo, new THREE.LineBasicMaterial({ color: 'yellow' }));
  ecliptic.scale.set(cel_radius, 1, cel_radius);
  celestial.add(ecliptic);

  // 指定した日の太陽の軌跡と月の軌跡
  sun_trajectory = new THREE.Line(
    geo, new THREE.LineBasicMaterial({ color: 0xff7777, linewidth: 3}));
  celestial.add(sun_trajectory);

  sun0 = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius*0.1, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'yellow', emissive: 0xffff40 }));
  celestial.add(sun0);

  var sun_light0 = new THREE.DirectionalLight(0xffffff);
  sun_light0.target = scene;
  sun0.add(sun_light0);

  moon0 = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius*0.07, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'white' }));
  scene.add(moon0);

  if ( debug ) {
    moon0.add(new THREE.AxisHelper(cel_radius*0.11));
  }

  var brown = new THREE.MeshLambertMaterial(
        { color: 0xaa7733, transparent: true, opacity: 0.8 }),
      black = new THREE.MeshLambertMaterial(
        { ambient: 0xbbbbbb, color: 0, transparent: true, opacity: 0.8 }),
      ground_material = new THREE.MeshFaceMaterial(
        [black, black, black, black, brown, black]),
      ground0 = new THREE.Mesh(
        new THREE.CubeGeometry(600, 600,cel_radius * 1.1), ground_material);
  ground0.position.z = -cel_radius*1.1/2;
  showLabels0();
  scene.add(ground0);

/*
  var light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0,0,50);
  light.target = ground0;
  scene.add(light);
*/
  scene.add(new THREE.AmbientLight(0x222));
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

  var polaris1 = new THREE.Mesh(        // 天の北極
    new THREE.OctahedronGeometry(5),
    new THREE.MeshLambertMaterial({ color: 'gold', emissive: 0x999933 }));
  polaris1.position.set(
    0,
    Math.sin(earth_th) * arena1_scale * 0.9,
    Math.cos(earth_th) * arena1_scale * 0.9);
  scene.add(polaris1);

  earth1 = new THREE.Object3D();
  var texture = THREE.ImageUtils.loadTexture(
        'land_ocean_ice_cloud_2048.jpeg',
        null,
        function() { unloaded_texture -= 1;}),
      sphere = new THREE.Mesh(
        new THREE.SphereGeometry(earth_radius, 30, 20),
        new THREE.MeshLambertMaterial({ map: texture, overdraw: true }));
  sphere.rotation.set(Math.PI/2, Math.PI/0.8, 0);
  earth1.add(sphere);
  scene.add(earth1);

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
  earth1.add(trajectory);

  // 北回帰線
  trajectory = circle.clone();
  trajectory.scale.set(
    Math.cos(earth_th) * earth_radius, Math.cos(earth_th) * earth_radius, 1);
  trajectory.position.z = Math.sin(earth_th) * earth_radius;
  earth1.add(trajectory);

  // 南回帰線
  trajectory = circle.clone();
  trajectory.scale.set(
    Math.cos(earth_th) * earth_radius, Math.cos(earth_th) * earth_radius, 1);
  trajectory.position.z = -Math.sin(earth_th) * earth_radius;
  earth1.add(trajectory);

  // 黄道
  trajectory = circle.clone();
  trajectory.scale.set(
    arena1_scale * 1.8, arena1_scale * 1.8, 1);
  scene.add(trajectory);

  ground1 = new THREE.Mesh(
    new THREE.PlaneGeometry(arena1_scale*0.8, arena1_scale*0.8),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 0xaa7744, transparent: true, opacity: 0.9 }));
  var ground_back = new THREE.Mesh(
    new THREE.PlaneGeometry(arena1_scale*0.8, arena1_scale*0.8),
    new THREE.MeshLambertMaterial({ color: 'black' }));
  ground_back.rotation.x = Math.PI;
  ground1.add(ground_back);
  showLabels1(ground1);
  earth1.add(ground1);

  sun_light1 = new THREE.DirectionalLight(0xffffff, 1.2);
  sun_light1.target = earth1;
  scene.add(sun_light1);
//  scene.add(new THREE.AmbientLight(0x101010));

  var sun1 = new THREE.Mesh(
    new THREE.SphereGeometry(arena1_scale*0.1, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'yellow', emissive: 0xffff40 }));
  sun_light1.add(sun1);

  // 白道
  moons_path = new THREE.Object3D();
  scene.add(moons_path);
  trajectory = circle.clone();
  trajectory.scale.set(
    arena1_scale * 1.4, arena1_scale * 1.4, 1);
  moons_path.add(trajectory);

  // 昇交点、降交点
  var node = new THREE.Mesh(
    new THREE.SphereGeometry(3),
    new THREE.MeshLambertMaterial({ color: 0, emissive: 'red' }));
  node.position.x = arena1_scale * 1.4;
  moons_path.add(node);
  node = node.clone();
  node.position.x = arena1_scale * 1.8;
  moons_path.add(node);
  node = new THREE.Mesh(
    new THREE.SphereGeometry(3),
    new THREE.MeshLambertMaterial({ color: 'black' }));
  node.position.x = -arena1_scale * 1.4;
  moons_path.add(node);
  node = node.clone();
  node.position.x = -arena1_scale * 1.8;
  moons_path.add(node);

  moon1 = new THREE.Mesh(
    new THREE.SphereGeometry(arena1_scale*0.07, 30, 20),
    new THREE.MeshLambertMaterial({ color: 'gray' }));
  scene.add(moon1);

  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  $('#arena1').append(renderer.domElement);
}

/* arena2 の初期設定 */
function init2() {
  var arena = $('#arena2'),
      scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(
        0.8, arena.innerWidth() / arena.innerHeight(), 0.07, 100),
      texture = THREE.ImageUtils.loadTexture(
        'moon.jpeg',
        null, function() { unloaded_texture -= 1;}),
      renderer = new THREE.WebGLRenderer({ antialias: true });

  scenes.push(scene);
  renderers.push(renderer);
  cameras.push(camera);

  camera.position.set(0,0,0);
  camera.up = e3.clone();

  // 日蝕用に本当の視直径0.52度に合わせる
  moon2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 30, 20),
    /* x: 緯度0,経度0, y: 北極, z: 緯度0,東経270
       (http://ja.wikipedia.org/wiki/月面座標 */
    new THREE.MeshLambertMaterial({ map: texture, overdraw: true })
  );
  moon2.receiveShadow = true;
  moon2.quaternion = moon0.quaternion;
  scene.add(moon2);
  if ( debug ) {
    helper = new THREE.CameraHelper(camera);
    scenes[0].add(helper);
    moon2.add(new THREE.AxisHelper(0.11));
  }

  sun_light2 = new THREE.DirectionalLight(0xffffff,1.5);
  sun_light2.castShadow = true;
  sun_light2.shadowMapWidth = 512;
  sun_light2.shadowMapHeight = 512;
  sun_light2.shadowCameraNear = 0.07;
  sun_light2.shadowCameraFar = 100;
  sun_light2.shadowCameraLeft = -0.5;
  sun_light2.shadowCameraRight = 0.5;
  sun_light2.shadowCameraBottom = -0.5;
  sun_light2.shadowCameraTop = 0.5;
  sun_light2.shadowDarkness = 0.7;
  scene.add(sun_light2);
/*
  // こんな感じにすれば、日中に太陽の光で月が見えないようにできる
  scene.add(new THREE.AmbientLight('blue'));
  scene.fog = new THREE.FogExp2('blue',0.08);
  renderer.setClearColor('blue');

  // こんな感じのやり方で opacityを調節しても出来そう。夕方にも勝手になる。
  // 但し、このままだと、地平線の辺りに隙間が残る
  sky2 = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshLambertMaterial({
      color: 'red', emissive: 'blue', transparent: true, opacity: 0.7 }));
  sky2.position.z = 0.1;
  sky2.rotation.x = Math.PI;
  scene.add(sky2);
*/

  if ( !debug ) {
    var ground2 = new THREE.Mesh(
      new THREE.PlaneGeometry(19,19),
      new THREE.MeshLambertMaterial({ color: 0, emissive: 0x6b4513 }));
    ground2.position.z = -0.07;
    scene.add(ground2);
  }

  earth2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.33, 30, 20),
    new THREE.MeshLambertMaterial({ color: 'white' }));
  earth2.castShadow = true;
  scene.add(earth2);

  sun2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'yellow', emissive: 0xffff40 }));
  scene.add(sun2);

  renderer.shadowMapEnabled = true;
  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  $('#arena2').append(renderer.domElement);
}

function update() {
  if ( animate || unloaded_texture > 0)
    requestAnimationFrame(update);

  for ( var i = 0; i < 2; ++i ) {
    controls[i].update();
    renderers[i].render(scenes[i], cameras[i]);
  }

  if ( debug )
    helper.update();

  renderers[2].render(scenes[2], cameras[2]);
}

function setHandlers() {

  $('#arena0, #arena1').mousedown(function() {
    animate = true;
    update();
  });

  $('#arena0, #arena1').mouseup(function() {
    animate = false;
  });

  $('#arena0, #arena1').on('mousewheel', function() {
    update();
  });

  $('#arena0, #arena1').on('DOMMouseScroll', function() {
    update();
  });

  $('#arena0, #arena1').on('touchstart', function() {
    animate = true;
    update();
  });

  $('#arena0, #arena1, form').on('touchend', function() {
    animate = false;
  });

  $('input').change(function() {
    update();
  });
}

function adjustStyle() {
  var w01 = $('#arena0').width(), h01 = w01*0.8, wh2 = w01*0.3;
  $('#arena0, #arena1').height(h01);
  $('#arena2').css({width: wh2, height: wh2, left: -w01*0.1});

  if ( renderers.length > 0 ) {
    renderers[0].setSize(w01, h01);
    cameras[0].aspect = w01/h01;
    cameras[0].updateProjectionMatrix();
    renderers[1].setSize(w01, h01);
    cameras[1].aspect = w01/h01;
    cameras[1].updateProjectionMatrix();
    renderers[2].setSize(wh2, wh2);
    update();
  }
}

function onWindowResize() {
  adjustStyle();
}

$(function() {
  adjustStyle();

  $(window).resize(onWindowResize);
  $('.settings').change(newSettings);

  unloaded_texture = 2;
  init0();
  init1();
  init2();

  setHandlers();

  animate = false;
  newSettings();
  update();
});
