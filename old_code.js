import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
// import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { ConvexHull } from "https://cdn.jsdelivr.net/npm/three@0.171.0/examples/jsm/math/ConvexHull.js";



let url = window.location.href;

// Create a URLSearchParams object to parse the query string
let urlParams = new URLSearchParams(window.location.search);

// Get the value of the 'value' query parameter
let urlValue = urlParams.get('event');

let eventType = "durability"; // pull, maneuver, durability

//really dumb way to make sure
if (urlValue == 'durability'){
    eventType = "durability";
} else if (urlValue == 'pull'){
    eventType = "pull";
} else if (urlValue == 'maneuver'){
    eventType = "maneuver";
} 
console.log(eventType)


const size = [window.innerWidth, window.innerHeight];
const globeSize = 100;


// const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// const renderer = new THREE.WebGLRenderer();
// renderer.setSize(window.innerWidth, window.innerHeight);


const renderer = new THREE.WebGLRenderer();
renderer.setSize(size[0], size[1]);
document.body.appendChild(renderer.domElement);
renderer.domElement.style.position = "absolute";
renderer.domElement.style.top = "0px";
renderer.domElement.style.left = "0px";
renderer.domElement.style.zIndex = "1";

const scene = new THREE.Scene(); {
    const ambientLight = new THREE.AmbientLight(0x808080); // Soft ambient light
    scene.add(ambientLight);

    const spotLight = new THREE.SpotLight( 0xffffff );
    spotLight.position.set(0,20,0);
    spotLight.lookAt(0,0,0)

    spotLight.castShadow = false;
    spotLight.intensity = 200;
    scene.add(spotLight)

}
const startTime = Date.now();

const camera = new THREE.PerspectiveCamera(75, size[0] / size[1], 0.1, 1000);
// camera.position.set( -0.3, 1.7, 0 );
// camera.lookAt(0, 0, 100);

camera.position.set(-1,2,1);
camera.lookAt(0,0,0)

scene.background = new THREE.Color(0x87CEEB);

// Render the scene
// renderer.render(scene, camera);

let rotationX = 0; // Pitch (up and down)
let rotationY = 0; // Yaw (left and right)
const movement = {forward: false, backward: false, left: false, right: false , up: false, down: false, steerRight: false, steerLeft: false, throttleUp: false, throttleDown: false};
const moveSpeed = 0.02;

let mouseDown = false;
const sensitivity = 0.006;
var yaw = 0;
var pitch = 0;
const tractorModel = new THREE.Group();

let partNum = 0;

let running = false;
let requestInt = undefined; 

let freemove = true;

const rightTireInds = [];
const tractorParts = {"static": undefined, "rightFrontWheel": undefined, "leftFrontWheel": undefined, "rearWheels": undefined, "joystick": undefined};
const partOffsets = {"leftFrontWheel": new THREE.Vector3(1.67, 0.42, -0.38), "rightFrontWheel": new THREE.Vector3(1.67, 0.42, 0.38),
                    "static": new THREE.Vector3(0,0,0), "rearWheels": new THREE.Vector3(-0.25, 0.41, 0), 
                    "joystick": new THREE.Vector3(-0.05,1.2,0.34)};
                    // (0.03,-0.3,1.2)

const tractorFloorLevel = [0, 0, 0, 0]; // left front, right front, left rear, right rear
let tractorRotation = 0;
const tractorPosition = new THREE.Vector3(0,0,0);
let steerPos = 50; // 0 to 100
let animationIteration = 0;

let maneuverPosts = [];
const durabilityOutlines = [];

let loadedParts = 0;

let trailer = undefined;
let trailerRot = 0;

let bigDisplay = undefined;
let tractorDisplay = undefined;

let gear = 0;

let speedForward = 0;

let tractorRPM = 3000
let throttle = 0;
let clutchEngaged = 1;
let brakeEngaged = 0
let gripPressed = false;
let gripZeroed = false;


const footprint = new THREE.Group()




class Bus {
    constructor(){
        console.log("start");
        this.componentsConnected = {"feather": true, "pi": true, "rpm1": true, "rpm2": true, "joystick": true,
                            "potentiometer": true, "steerActuator": true, "throttleActuator": true};

        this.joystickPosition = [0,0]; // -100 to +100 each
        this.joystickButtons = {"grip": false, "red": false, "black": false, "blue": false, "wheelUp": false, "wheelDown": false};
        this.lastLength = 0;
        this.messages = [];
        this.messagesShow = [];
        this.potValue=0; // 0 - 100
        this.actuatorPosition=0; // 0 to 100
        this.throttlePosition=0; // 0 to 222
        this.rpm1 = 0;
        this.rpm2 = 0;
        this.positionSteering = true;
        this.throttleMultiplier = 1;
        this.targetThrottleRaw = 0;
        this.joystickZeroed = false;
        this.redPressed = false;

        this.piControl = false;

        this.lastSendTimes = {"feather": Date.now(), "pi": Date.now(), "joystick": Date.now(), "throttleActuator": Date.now()};
    }

    update() {

        this.joystickPosition = [steerPos, throttle/50+50]; // -100 to +100 each
        // console.log(this.joystickPosition)
        this.joystickButtons = {"grip": gripPressed, "red": false, "black": false, "blue": false, "wheelUp": false, "wheelDown": false};


        if (this.componentsConnected["feather"]) {
            if (Date.now() - this.lastSendTimes["feather"] > 70) {
                if (this.componentsConnected["joystick"]){
                    if (this.joystickButtons["black"]) {this.throttleMultiplier=1;}
                    if (this.joystickButtons["blue"]) {this.throttleMultiplier=0.5;}
                    if (this.joystickButtons["red"]) {this.redPressed = true;}
                    if (this.joystickButtons["grip"] && this.joystickPosition[1] <=50){
                        this.joystickZeroed = true;
                    } else if (this.joystickButtons["grip"] && this.joystickZeroed){
                        this.targetThrottleRaw = (this.joystickPosition[1]-50)*2;
                    } else if (!this.joystickButtons["grip"]) {
                        this.joystickZeroed = false;
                        if (this.joystickPosition[1] <= 50){
                            this.targetThrottleRaw = 0;
                        }
                    }
                    if (this.redPressed && !this.joystickButtons["red"]){
                        this.redPressed = false;
                        this.positionSteering = !this.positionSteering
                    }
                }

                const targetThrottle = (100-this.targetThrottleRaw)*this.throttleMultiplier*40
                this.messages.push([Date.now(), 0xCF01A00, Math.floor(targetThrottle%256), Math.floor(targetThrottle/256), 0, 0, 0, 0, 0, 0]) // 0xCF01A00
                
                if (this.componentsConnected["potentiometer"]) { // sensor 3210123
                    this.potValue=this.actuatorPosition;
                    let val = Math.floor(this.potValue * 65.535);
                    const isPosSteering = this.positionSteering ? 1 : 0;
                    this.messages.push([Date.now(), 3210123, 0, Math.floor(val%256), Math.floor(val/256), isPosSteering, 0, 0, 0, 0]);
                } else {
                    this.potValue=this.actuatorPosition;
                    let val = Math.floor(80 * 65.535);
                    const isPosSteering = this.positionSteering ? 1 : 0;
                    this.messages.push([Date.now(), 3210123, 0, Math.floor(val%256), Math.floor(val/256), isPosSteering, 0, 0, 0, 0]);
                }

                if (this.componentsConnected["steerActuator"]){
                    if (this.positionSteering){
                        this.actuatorPosition = (this.actuatorPosition + this.joystickPosition[0])/2;
                    } else {
                        this.actuatorPosition = Math.max(0, Math.min(100, this.actuatorPosition+(this.joystickPosition[0]-50)/10));
                    }
                }

                if (this.componentsConnected["rpm1"]){
                    let val = Math.floor(this.rpm1 * 65.535);
                    this.messages.push([Date.now(), 3210123, 1, Math.floor(val%256), Math.floor(val/256), 0, 0, 0, 0, 0]);
                } else {
                    const val = 0;
                    this.messages.push([Date.now(), 3210123, 1, Math.floor(val%256), Math.floor(val/256), 0, 0, 0, 0, 0]);
                }

                if (this.componentsConnected["rpm2"]){
                    let val = Math.floor(this.rpm2 * 65.535);
                    this.messages.push([Date.now(), 3210123, 2, Math.floor(val%256), Math.floor(val/256), 0, 0, 0, 0, 0]);
                } else {
                    const val = 0;
                    this.messages.push([Date.now(), 3210123, 2, Math.floor(val%256), Math.floor(val/256), 0, 0, 0, 0, 0]);
                }


                if (this.positionSteering) {
                    const target_steer_pos = Math.floor(Math.max(0, Math.min(100, 100 - ((this.joystickPosition[0] + 100) / 2) )));
                    this.messages.push([Date.now(), 1230321, target_steer_pos%256, Math.floor(target_steer_pos/256), 1, 0, 0, 0, 0, 0]); // steer command
                } else {
                    let target_steer_dir = 65535/2;
                    if (this.joystickPosition[0] > 0) {target_steer_dir=65535;}
                    if (this.joystickPosition[0] < 0) {target_steer_dir=0;}
                    this.messages.push([Date.now(), 1230321, target_steer_dir%256, Math.floor(target_steer_dir/256), 0, 0, 0, 0, 0, 0]); // steer command
                }

                this.messages.push([Date.now(), 12345, 1, 123, 123, 1, 0, 0, 0, 0]); // 12345 presence


                this.lastSendTimes["feather"] = Date.now();
            }
        }
        if (this.componentsConnected["joystick"]){
            if (Date.now() - this.lastSendTimes["joystick"] > 100) {
                const msg = [Date.now(), 217962035, 0, 0, 0, 0, 0, 0, 0, 0]; // 217962035
                // this.joystickPosition = [25, 25]
                const xPos = this.joystickPosition[0]; // -100 to 100
                const yPos = this.joystickPosition[1]; // -100 to 100

                let xSignFlag = (xPos >= 0) ? 16 : 4;
                let xBaseValue = Math.abs(xPos);
                msg[3] = Math.floor(xBaseValue / 4);
                msg[2] = (xBaseValue % 4) * 64 + xSignFlag;

                let ySignFlag = (yPos >= 0) ? 16 : 4;
                let yBaseValue = Math.abs(yPos);
                msg[5] = Math.floor(yBaseValue / 4);
                msg[4] = (yBaseValue % 4) * 64 + ySignFlag;

                msg[7] = (this.joystickButtons["red"] ? 16 : 0) +
                     (this.joystickButtons["blue"] ? 64 : 0) +
                     (this.joystickButtons["wheelUp"] ? 4 : 0) +
                     (this.joystickButtons["wheelDown"] ? 1 : 0);

                // Encode row[8] (corresponds to Python's row[2+6])
                msg[8] = (this.joystickButtons["black"] ? 64 : 0) +
                         (this.joystickButtons["grip"] ? 1 : 0);

                this.messages.push(msg);
                this.lastSendTimes["joystick"] = Date.now();

            }
        }
        if (this.componentsConnected["throttleActuator"]){
            if (Date.now() - this.lastSendTimes["throttleActuator"] > 100) {
                const msg = [Date.now(), 419361298, 255, 255, 255, 255, 255, 255, 255, 255]; //419361298
                this.throttlePosition = (this.targetThrottleRaw*2.55 + this.throttlePosition)/2
                msg[8] = Math.floor(this.throttlePosition)
                this.rpm1 = 32 * (this.throttlePosition*80+20) * this.throttleMultiplier;
                this.rpm2 = 32 * (this.throttlePosition*80+20) / 3 * this.throttleMultiplier;
                this.messages.push(msg);
                this.lastSendTimes["throttleActuator"] = Date.now();
            }
        }

 

        if (this.componentsConnected["pi"]){
            if (Date.now() - this.lastSendTimes["pi"] > 1000) {
                this.lastSendTimes["pi"] = Date.now();
            }
        }
    }

}


let bus = new Bus();

document.getElementById("downloadCan").onclick = function(){
    const csvContent = bus.messages.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "logs.csv";
    link.click();
}




function handleMouseMove(event) {

    if (document.pointerLockElement === document.body){


        const deltaX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const deltaY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        rotationY -= deltaX * sensitivity; 
        rotationX -= deltaY * sensitivity;

        rotationX = Math.max(-Math.PI / 2 + 0.6, Math.min(Math.PI / 2, rotationX));

        // console.log(rotationX, rotationY);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
        const pitchQuaternion = new THREE.Quaternion();
        pitchQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotationX);
        quaternion.multiply(pitchQuaternion);
        camera.quaternion.copy(quaternion);

    }
}

function handleClick(event){
    // console.log(document.body)
    const element = document.body;
    if (document.pointerLockElement !== element)  {
        element.requestPointerLock = element.requestPointerLock || element.mozRequestPointerLock || element.webkitRequestPointerLock;
        element.requestPointerLock();
        return;
    }
}

function handleMouseUp(event){
    mouseDown = false;
}
function handleMouseDown(event){
    mouseDown = false;
}



document.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'KeyW': movement.throttleUp = true; break;
    case 'KeyS': movement.throttleDown = true; break;
    case 'KeyA': movement.steerLeft = true; break;
    case 'KeyD': movement.steerRight = true; break;

    case 'KeyC': clutchEngaged=0; break;
    case 'KeyE': brakeEngaged=1; break;
    case 'KeyR': brakeEngaged=1; break;
    // case 'KeyW': movement.forward = true; break;
    // case 'KeyS': movement.backward = true; break;
    // case 'KeyA': movement.left = true; break;
    // case 'KeyD': movement.right = true; break;


    // case 'ArrowLeft': movement.left = true; break;
    // case 'ArrowRight': movement.right = true; break;
    // case 'ArrowUp': movement.forward = true; break;
    // case 'ArrowDown': movement.backward = true; break;

    // case 'ShiftLeft': movement.down = true; break;
    // case 'ShiftRight': movement.down = true; break;
    // case 'Space': movement.up = true; break;

    case 'Space': gripPressed = true; break;
    case 'Backquote': if (clutchEngaged==0) {gear = -1;}; break;
    case 'Digit1': if (clutchEngaged==0) {gear = 1;}; break;
    case 'Digit2': if (clutchEngaged==0) {gear = 2;}; break;
    case 'Digit3': if (clutchEngaged==0) {gear = 3;}; break;

    case 'Enter': console.log(Math.floor(camera.position.x), Math.floor(camera.position.z)); break;
  }
});

document.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyW': movement.throttleUp = false; break;
    case 'KeyS': movement.throttleDown = false; break;
    case 'KeyA': movement.steerLeft = false; break;
    case 'KeyD': movement.steerRight = false; break;

    case 'KeyC': clutchEngaged=1; break;
    case 'KeyE': brakeEngaged=0; break;
    case 'KeyR': brakeEngaged=0; break;
    // case 'KeyW': movement.forward = false; break;
    // case 'KeyS': movement.backward = false; break;
    // case 'KeyA': movement.left = false; break;
    // case 'KeyD': movement.right = false; break;

    case 'Space': gripPressed = false; break;

    // case 'ArrowLeft': movement.left = false; break;
    // case 'ArrowRight': movement.right = false; break;
    // case 'ArrowUp': movement.forward = false; break;
    // case 'ArrowDown': movement.backward = false; break;

    // case 'ShiftLeft': movement.down = false; break;
    // case 'ShiftRight': movement.down = false; break;
    // case 'Space': movement.up = false; break;
  }
});







function loadModel(){
    // return;
    // makeCube(0,0,0)
    const loader = new GLTFLoader();
    loader.load("./model_static.glb", function (gltf) {
        const model = gltf.scene;
        tractorParts["static"] = model;
        loadedParts+=1;

        
        // let numBoxes = 0;
        model.traverse((child) => {
            if (child.isMesh) { // Ensure the child has geometry
                const box = new THREE.Box3().setFromObject(child);
                const s = (box.max.x-box.min.x) * (box.max.z-box.min.z)
                // console.log("s", s)
                if (s > 0.08){//0.08){
                    const geometry = new THREE.BoxGeometry(box.max.x-box.min.x, 0.1, box.max.z-box.min.z); 
                    const material = new THREE.MeshBasicMaterial({ color:  0xff0000});
                    const cube = new THREE.Mesh(geometry, material);
                    cube.position.set((box.max.x+box.min.x)/2, -0.1, (box.max.z+box.min.z)/2)
                    footprint.add(cube)
                    // numBoxes++;
                }
            }
        });
        {
            const geometry = new THREE.BoxGeometry(0.4, 0.1, 0.9); 
            const material = new THREE.MeshBasicMaterial({ color:  0xff0000});
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(1.7, -1, 0)
            // scene.add(cube)
            footprint.add(cube)
        }
        scene.add(footprint);

        



    }, undefined, function (error) {
        console.error(error);
    });

    loader.load("./rear_wheels.glb", function (gltf) {
        const model = gltf.scene;
        tractorParts["rearWheels"] = model;
        // scene.add(model)

        model.children[0].children.forEach(child => {
        if (child.isMesh) {
                child.geometry.translate(0.25,0,0.41)
            }
        });
        loadedParts+=1
    }, undefined, function (error) {
        console.error(error);
    });

    loader.load("./joystick.glb", function (gltf) {
        const model = gltf.scene;
        tractorParts["joystick"] = model;
        // scene.add(model)

        model.children[0].children.forEach(child => {
        if (child.isMesh) {
                child.geometry.translate(0.03,-0.3,1.2)
            }
        });
        // scene.add(model)
        
        loadedParts+=1
    }, undefined, function (error) {
        console.error(error);
    });

    loader.load("./front_wheel.glb", function (gltf) {
        const model = gltf.scene;
        tractorParts["rightFrontWheel"] = model;
        model.children[0].children.forEach(child => {
        if (child.isMesh) {
                child.geometry.translate(-1.67, -0.38, 0.42)
            }
        });
        const model2 = model.clone()
        tractorParts["leftFrontWheel"] = model2;
        loadedParts+=1;

        
    }, undefined, function (error) {
        console.error(error);
    });

}


function makeLoadToad(){
    const g = new THREE.Group();
    const boxes = [
        {"shape": [3, 2, 1.5], "color": 0x202020, "position": [-1.25,0,0]},

    ]

    for (const b of boxes){
        const geometry = new THREE.BoxGeometry(b.shape[0], b.shape[1], b.shape[2]); 
        const material = new THREE.MeshPhongMaterial({ color:  b.color});

        const cube = new THREE.Mesh(geometry, material);
        
        cube.position.set(b.position[0], b.position[1], b.position[2])
        g.add(cube)
    }
    
    g.position.set(-1, 0, 0)
    // scene.add(g);
    trailer = g;
}

function makeSled(){
    const g = new THREE.Group();
    const boxes = [
        {"shape": [0.1, 1, 1.5], "color": 0x808080, "position": [0,0,0]},
        {"shape": [0.05, 1.6, 0.05], "color": 0x808080, "position": [0,1,1.5/2]},
        {"shape": [0.05, 1.6, 0.05], "color": 0x808080, "position": [0,1,-1.5/2]},
        {"shape": [0.05, 0.05, 1.5], "color": 0x808080, "position": [0,1.8,0]},
        {"shape": [3, 0.3, 1.5], "color": 0xff0000, "position": [-1.25,0,0]},
        {"shape": [1, 1, 1.5], "color": 0xffff00, "position": [-1.25,0.3,0]},
        {"shape": [0.8, 1, 1.25], "color": 0x808080, "position": [-1.25,0.5,0]},

    ]

    for (const b of boxes){
        const geometry = new THREE.BoxGeometry(b.shape[0], b.shape[1], b.shape[2]); 
        const material = new THREE.MeshPhongMaterial({ color:  b.color});

        const cube = new THREE.Mesh(geometry, material);
        
        cube.position.set(b.position[0], b.position[1], b.position[2])
        g.add(cube)
    }
    
    g.position.set(-1, 0, 0)
    // scene.add(g);
    trailer = g;
}

// Returns a positive value for counter-clockwise, negative for clockwise, and 0 for collinear
function cross(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}


function convexHull(points) {
    points = points.sort((a, b) => a.x - b.x || a.y - b.y);

    function cross(o, a, b) {
        return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }
    const lower = [];
    for (let point of points) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop(); 
        }
        lower.push(point);
    }
    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
            upper.pop();
        }
        upper.push(points[i]);
    }
    lower.pop();
    upper.pop();
    return [...lower, ...upper];
}

function getOutline(mesh){
    const uniqueVerticesMap = new Map(); // Use a Map to store unique Vector3 objects
    mesh.traverse((object) => {
        if (object.isMesh) {
            const geometry = object.geometry;
            const position = geometry.attributes.position;
            const tempVec = new THREE.Vector3();

            for (let i = 0; i < position.count; i++) {
                tempVec.fromBufferAttribute(position, i);
                tempVec.applyMatrix4(object.matrixWorld);
                const key = `${tempVec.x.toFixed(6)},${tempVec.z.toFixed(6)}`; // Precision control
                if (!uniqueVerticesMap.has(key)) {
                    uniqueVerticesMap.set(key, new THREE.Vector3(tempVec.x, 0.001, tempVec.z));
                }
            }
        }
    });

    const uniqueVertices = Array.from(uniqueVerticesMap.values());

    // Ensure we have enough points
    if (uniqueVertices.length < 4) {
        console.error("Not enough unique points for ConvexHull!");
    } else {
        const hull = new ConvexHull();
        hull.setFromPoints(uniqueVertices); // Compute hull
        let outlinePolygon = hull.vertices.map(v => new THREE.Vector2(v.point.x, v.point.z));
        return convexHull(outlinePolygon);
    }
}


function isPointInPolygon(point, polygon) {
    let x = point.x;
    let y = point.y;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i].x, yi = polygon[i].y;
        let xj = polygon[j].x, yj = polygon[j].y;

        // Check if point is on the line segment
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }

    return inside;
}

function makeManeuverPost(x,z, color=0xffff00){
    const g = new THREE.Group()

    const geometry = new THREE.BoxGeometry(0.1, 0.6, 0.1); 
    
    const material = new THREE.MeshPhongMaterial({ color: color , emissive: color==0xffff00 ? 0x4f4f00 : 0x9f0000, shininess: 100});
    
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 0.3, 0)
    g.add(cube);


    const geometry2 = new THREE.CylinderGeometry(0.03, 0.03, 1, 32, 32, false);

    const material2 = new THREE.MeshPhongMaterial({ color: 0xffffff , emissive: 0x787878, shininess: 100});
    // const material2 = new THREE.MeshBasicMaterial({ color: color });

    const cylinder = new THREE.Mesh(geometry2, material2);
    cylinder.position.set(0, 0.6, 0);
    g.add(cylinder);

    const geometry3 = new THREE.SphereGeometry(0.05, 32, 32);
    const sphere = new THREE.Mesh(geometry3, material2);
    sphere.position.set(0, 1.15, 0);
    g.add(sphere)

    g.position.set(x, 0, z)

    scene.add(g);
    return g;
}


function createScreenTexture(val, size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Background color
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, size, size);

    // Number styling
    ctx.fillStyle = 'red';
    ctx.font = `${size / 2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw number in the center
    ctx.fillText(val, size / 2, size / 2);

    return new THREE.CanvasTexture(canvas);
}


function createWordTexture(val, size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Background color
    ctx.fillStyle = 'yellow';
    ctx.fillRect(0, 0, size, size);

    // Number styling
    ctx.fillStyle = 'black';
    ctx.font = `${size / 4}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw number in the center
    ctx.fillText(val, size / 2, size / 2);

    return new THREE.CanvasTexture(canvas);
}




function animate() {
    if (document.pointerLockElement !== document.body && !(loadedParts==4 && animationIteration==0)) {
        // document.getElementById("downloadCan").style.visibility = "visible";
        return;
    } else {
        // document.getElementById("downloadCan").style.visibility = "hidden";
    }

    if (tractorModel.children.length == 0 && loadedParts==4){// && tractorParts["rearWheels"]!=undefined){
        // console.log("add")
        tractorModel.add(tractorParts["static"]);
        for (const p in partOffsets) {
                if (p=="static"){
                    continue;
                }

                const pos = partOffsets[p];
                const wheel = tractorParts[p];
                wheel.rotation.z = Math.PI / 2;
                wheel.position.copy(pos);
                tractorModel.add(wheel);
        }

        const geometry = new THREE.BoxGeometry(0.01,0.15,0.22);
        const material = new THREE.MeshBasicMaterial({ map: createWordTexture("start") });
        tractorDisplay = new THREE.Mesh(geometry, material);
        tractorDisplay.position.set(0.6,1.2,0.1)

        tractorModel.add(tractorDisplay)
        if (trailer != undefined){
            tractorModel.add(trailer);
            trailer.rotation.z = 0.06;
        }

        tractorParts["joystick"].rotation.y = Math.PI/2
        tractorParts["joystick"].rotation.x = -Math.PI/2
        // tractorParts["joystick"].rotation.z = Math.PI/2
        scene.add(tractorModel);

        tractorModel.position.y = -0.1;
        tractorModel.rotation.z = -0.06



        if (eventType == "maneuver"){
            tractorModel.position.x = 4;
            tractorModel.position.z = -3
            tractorRotation = Math.PI;
        } else if (eventType == "durability"){
            tractorModel.position.x = -10;
            tractorModel.position.z = -3
            tractorModel.rotation.y = tractorRotation;
            tractorRotation = Math.PI/2;
            if (trailer != undefined){
                trailer.rotation.y = tractorRotation;
            }
        } else if (eventType == "pull"){
            tractorModel.position.z = -3;
        }

        
        

        tractorModel.rotation.y = tractorRotation;
        footprint.rotation.y = tractorRotation;
        
    }

    animationIteration += 1;
    if (freemove){
        const direction = new THREE.Vector3();

        let forward = 0;
        let side = 0;
        if (movement.forward) {
            forward -= moveSpeed;
        } if (movement.backward) {
            forward += moveSpeed;
        } if (movement.left) {
            side -= moveSpeed;
        } if (movement.right) {
            side += moveSpeed;
        }
        direction.x = forward*Math.sin(rotationY) + side*Math.sin(rotationY+Math.PI/2);
        direction.z = forward*Math.cos(rotationY) + side*Math.cos(rotationY+Math.PI/2);

        direction.y = 0;
        camera.position.add(direction);

        if (movement.up){
            camera.position.y += moveSpeed;
        } if (movement.down){
            camera.position.y -= moveSpeed;
        }
    }

    let actuatorMove = 0;
    if (movement.steerLeft){
        actuatorMove -= 1;
    } if (movement.steerRight){
        actuatorMove += 1;
    }

    
    if (movement.throttleUp){
        if (gripPressed && gripZeroed) {
            throttle = Math.min(100, throttle+2)
        }
    } else {
        if (gripPressed) {
            gripZeroed = true;
        }
        throttle = Math.max(0, throttle-1)
    } if (! gripPressed){
        gripZeroed = false;
    }
    {

        speedForward = speedForward*0.996 + (gear * 0.02 * tractorRPM/3000 * clutchEngaged)*0.004;
        speedForward *= (1-brakeEngaged*(1-clutchEngaged)*0.1);
        if (tractorRPM == 0){
            speedForward *= 0.9;
        }
        // console.log(clutchEngaged, brakeEngaged, 1-brakeEngaged*(1-clutchEngaged)*0.4);
        // console.log(speedForward)
        tractorRotation = (tractorRotation-(steerPos-50)*speedForward/100)%(2*Math.PI);
        tractorModel.rotation.y = tractorRotation;
        footprint.rotation.y = tractorRotation;
        if (trailer != undefined){
            console.log(speedForward)
            trailerRot += -0.01*((trailerRot - tractorModel.rotation.y + Math.PI) % (2 * Math.PI) - Math.PI) * speedForward * 100;
            trailer.rotation.y = trailerRot -tractorRotation;
        }
        tractorModel.position.x += speedForward*Math.cos(-tractorRotation);
        tractorModel.position.z += speedForward*Math.sin(-tractorRotation);
        footprint.position.set(tractorModel.position.x, -0.3, tractorModel.position.z)


        let rotX = rotationX
        if (eventType == "durability"){

            // if (tractorModel.position.x > -10 && tractorModel.position.x < 20 && Math.abs(tractorModel.position.z+11.5) < 2 ){
            //     // console.log(animationIteration*speedForward*5)
            //     tractorModel.rotation.z = Math.sin(animationIteration*speedForward*4)*0.05
            //     rotX += Math.sin(animationIteration*speedForward*4)*0.05
            // }
        }


        rotationY+=-(steerPos-50)*speedForward/100;
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
        const pitchQuaternion = new THREE.Quaternion();
        pitchQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotX);
        quaternion.multiply(pitchQuaternion);
        camera.quaternion.copy(quaternion);

        camera.position.set(tractorModel.position.x-0.3*Math.cos(-tractorRotation), 
                            tractorModel.position.y+1.7 + Math.sin(animationIteration*(tractorRPM/1000))*0.003, 
                            tractorModel.position.z-0.3*Math.sin(-tractorRotation))//( -0.3, 1.7, 0 );

        tractorParts["rearWheels"].rotation.z -= speedForward*4

        if (animationIteration % 10 == 0){

            if (eventType == "maneuver"){
                const outline = getOutline(footprint);

                // console.log(outline)

                for (const p of maneuverPosts){
                    if (p.rotation.z == 0){
                        if (isPointInPolygon(new THREE.Vector2(p.position.x, p.position.z), outline)){
                            // console.log("hit", p.children[0].position.x, p.children[0].position.z);
                            
                            p.rotation.y = tractorRotation;
                            if (gear >= 0){
                                p.rotation.z = -0.1;
                            } else{ 
                                p.rotation.z = 0.1;
                            }

                            // p.children[2].material.color.set(0xff0000);
                        } 
                    }
                }
            }
        } if (animationIteration % 20 == 0){
            if (eventType == "pull"){
                bigDisplay.material.map = createScreenTexture((Math.floor(tractorModel.position.x*50)/10).toString()); 
            } else {
                const t = (Date.now()- startTime)/1000
                bigDisplay.material.map = createScreenTexture(Math.floor(t/60).toString().padStart(1, '0') + ":" + Math.floor(t%60).toString().padStart(2, '0')); 

            }

            tractorDisplay.material.map = createWordTexture((Math.floor(tractorRPM*10)/10).toString()); 

        }

        if (eventType == "pull"){
            if (tractorRPM > 0){
                let draft = tractorModel.position.x > 0 ? tractorModel.position.x*50 : 0;
                if (draft < 100){
                    tractorRPM = (3000*(30+throttle)/130 - draft*clutchEngaged*gear);
                } else {
                    tractorRPM = (3000*(30+throttle)/130  - draft*2*clutchEngaged*gear);
                }
            }
        } else {
            if (tractorRPM > 0){
                tractorRPM = 3000*(30+throttle)/130;
            }
        }

        
        tractorRPM -= brakeEngaged*(clutchEngaged)*800*Math.abs(gear);
        


        if (tractorRPM < 500){
            tractorRPM = 0;
        }

        if (eventType == "durability") {

            const frontLeftWheelPos = [Math.cos(-tractorRotation)*partOffsets["leftFrontWheel"].x + Math.sin(tractorRotation)*partOffsets["leftFrontWheel"].z,
                                    Math.sin(-tractorRotation)*partOffsets["leftFrontWheel"].x  + Math.cos(tractorRotation)*partOffsets["leftFrontWheel"].z]
            const frontRightWheelPos = [Math.cos(-tractorRotation)*partOffsets["rightFrontWheel"].x + Math.sin(tractorRotation)*partOffsets["rightFrontWheel"].z,
                                    Math.sin(-tractorRotation)*partOffsets["rightFrontWheel"].x  + Math.cos(tractorRotation)*partOffsets["rightFrontWheel"].z]
            
            const rearLeftWheelPos = [Math.cos(-tractorRotation)*-0.25 + Math.sin(tractorRotation)*-0.3,
                                    Math.sin(-tractorRotation)*-0.25  + Math.cos(tractorRotation)*-0.3]

            const rearRightWheelPos = [Math.cos(-tractorRotation)*-0.25 + Math.sin(tractorRotation)*0.3,
                                    Math.sin(-tractorRotation)*-0.25  + Math.cos(tractorRotation)*0.3]


            const bumpAmt = speedForward;
            for (const p of durabilityOutlines){
                if (isPointInPolygon(new THREE.Vector2(tractorModel.position.x + frontLeftWheelPos[0], tractorModel.position.z + frontLeftWheelPos[1]), p)){
                    tractorFloorLevel[0] += bumpAmt*2;
                } if (isPointInPolygon(new THREE.Vector2(tractorModel.position.x + frontRightWheelPos[0], tractorModel.position.z + frontRightWheelPos[1]), p)){
                    tractorFloorLevel[1] += bumpAmt*2;
                } if (isPointInPolygon(new THREE.Vector2(tractorModel.position.x + rearLeftWheelPos[0], tractorModel.position.z + rearLeftWheelPos[1]), p)){
                    tractorFloorLevel[2] += bumpAmt*2;
                } if (isPointInPolygon(new THREE.Vector2(tractorModel.position.x + rearRightWheelPos[0], tractorModel.position.z + rearRightWheelPos[1]), p)){
                    tractorFloorLevel[3] += bumpAmt*2;
                }
            }
            for (let i=0; i<4; i++){
                tractorFloorLevel[i] = Math.max(0, tractorFloorLevel[i]-bumpAmt);
            }
            const W = 0.6;
            const L = 1.67;
            const roll = Math.atan2((tractorFloorLevel[1] + tractorFloorLevel[3]) - (tractorFloorLevel[0] + tractorFloorLevel[2]), W);
            const pitch = Math.atan2((tractorFloorLevel[0] + tractorFloorLevel[1]) - (tractorFloorLevel[2] + tractorFloorLevel[3]), L);
            // console.log(roll, pitch, tractorFloorLevel);
            tractorModel.rotation.x = -roll/2;
            tractorModel.rotation.z = pitch/2;
        }


    }

    for (const p of maneuverPosts){
        if (p.rotation.z > 0 && p.rotation.z < Math.PI/2-0.03){
            p.rotation.z += 0.03;
        } if (p.rotation.z < 0 && p.rotation.z > -Math.PI/2+0.03){
            p.rotation.z -= 0.03;
        }
    }



    if (actuatorMove != 0) {
        steerPos = Math.max(0, Math.min(100, steerPos+actuatorMove));
        tractorParts["leftFrontWheel"].rotation.y = -(steerPos-50)/100;
        tractorParts["rightFrontWheel"].rotation.y = -(steerPos-50)/100;
        tractorParts["joystick"].rotation.z = Math.PI/2+(steerPos-50)/200;
    }

    if (animationIteration % 5 == 0){
        // bus.update();
    }

    // if (loadedParts == 4){
    //     camera.position.y = tractorModel.position.y+1.7 + Math.sin(animationIteration*2)*0.003;
    // }
    // if (loadedParts == 4){
    //     tractorParts["joystick"].rotation.z += 0.01
    // }
    renderer.render(scene, camera);
}




function makeCube(x,y,z){
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1); 
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    cube.position.set(x,y,z)
    return cube
}

function makeEnvironment(){

    { // side wall
        const geometry = new THREE.BoxGeometry(30, 1.8, 0.2); 
        const material = new THREE.MeshPhongMaterial({ color: 0xcd853f });
        const cube = new THREE.Mesh(geometry, material);
        const cube2 = cube.clone();
        cube.position.set(10, 0.5, 5);
        cube2.position.set(10, 0.5, -15);
        scene.add(cube);
        scene.add(cube2);
    }
    for (let i=-15; i<15; i+=5){
        const geometry = new THREE.BoxGeometry(0.3, 4, 0.3); 
        const material = new THREE.MeshPhongMaterial({ color: 0xcd853f });
        const cube = new THREE.Mesh(geometry, material);
        const cube2 = cube.clone();
        cube.position.set(i+10, 2, -15);
        cube2.position.set(i+10, 2, 5);
        scene.add(cube);
        scene.add(cube2);
    } 
    { // roof
        const geometry = new THREE.BoxGeometry(30, 14, 0.2); 
        const material = new THREE.MeshBasicMaterial({ color: 0x707070 });
        const cube = new THREE.Mesh(geometry, material);
        const cube2 = cube.clone()

        cube2.rotation.x = 1.1
        cube2.position.set(10, 6, -10);

        cube.rotation.x = -1.1
        cube.position.set(10, 6, 0);
        scene.add(cube);
        scene.add(cube2);
    }

    {
        const loader = new THREE.TextureLoader();
        const texture = loader.load(
            './skycube.webp',
            
            () => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                texture.colorSpace = THREE.SRGBColorSpace;
                scene.background = texture;

            } );
    }
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('./dirt.webp', function (texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4*globeSize/10, 4*globeSize/10); // Repeat 4 times in both directions
    });
    {
        const geometry = new THREE.PlaneGeometry(globeSize, globeSize);
        const material = new THREE.MeshBasicMaterial({ color: 0x644117, map: texture, side: THREE.DoubleSide });
        const floor = new THREE.Mesh(geometry, material);
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
    }


    {
        const geometry = new THREE.BoxGeometry(3, 4, 0.2); 
        const material = new THREE.MeshBasicMaterial({ color: 0x442107 });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(10, 2, -14)
        scene.add(cube)   

        const geometry2 = new THREE.BoxGeometry(2.5, 1, 0.2); 
        const material2 = new THREE.MeshBasicMaterial({ map: createScreenTexture("blah") });
        bigDisplay = new THREE.Mesh(geometry2, material2);
        bigDisplay.position.set(10, 3, -13.9)
        scene.add(bigDisplay)  
        bigDisplay.material.map = createScreenTexture("starting"); 

    }

    // track
    if (eventType == "pull") {
        const geometry = new THREE.PlaneGeometry(50, 0.1); 
        const material = new THREE.MeshBasicMaterial({ color: 0xdddddd });
        const cube = new THREE.Mesh(geometry, material);
        cube.rotation.x = -Math.PI/2;
        const cube2 = cube.clone();

        cube.position.set(20, 0.01, 0);
        cube2.position.set(20, 0.01, -5);
        scene.add(cube);
        scene.add(cube2);
    } else if (eventType == "durability") {

        for (let i=0; i<2; i++){

            const straightLength = i==0 ? 26 : 20;    // length of the straight sections
            const trackWidth = i==0 ? 14 : 6;        // full width of the track (outer shape)
            const radius = trackWidth / 2; // outer semicircle radius (0.5)
            const laneWidth = 0.1;       // width of the track border
            const extrudeDepth = 0.1;    // extrusion depth along z-axis

            const outerShape = new THREE.Shape();
            outerShape.moveTo(-straightLength / 2, -radius);   
            outerShape.lineTo(straightLength / 2, -radius);
            outerShape.absarc(
              straightLength / 2, 0, radius,  -Math.PI / 2, Math.PI / 2,false  );


            outerShape.lineTo(-straightLength / 2, radius);        
            outerShape.absarc( -straightLength / 2, 0, radius, Math.PI / 2,  -Math.PI / 2, false  );

            const innerRadius = radius - laneWidth; // 0.5 - 0.3 = 0.2

            const innerShape = new THREE.Path();
            innerShape.moveTo(-straightLength / 2, -(radius - laneWidth)); // start at (-1, -0.2)
            innerShape.lineTo(straightLength / 2, -(radius - laneWidth));  // bottom inner line: (-1, -0.2) -> (1, -0.2)

            innerShape.absarc(straightLength / 2,0, innerRadius, -Math.PI / 2, Math.PI / 2, false        );

            innerShape.lineTo(-straightLength / 2, (radius - laneWidth)); // top inner line: (1, 0.2) -> (-1, 0.2)

            innerShape.absarc(-straightLength / 2, 0, innerRadius,Math.PI / 2, -Math.PI / 2, false );

            outerShape.holes.push(innerShape);

            const extrudeSettings = { depth: 0.01, bevelEnabled: false };
            const trackGeometry = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);
            const trackMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false });
            const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
            trackMesh.rotation.x = Math.PI/2
            trackMesh.position.set(4,0.01,-6)
            scene.add(trackMesh);
        }

        for (let i=-7; i<20; i++){
            const g = new THREE.Group()
            const geometry = new THREE.BoxGeometry(0.15, 0.15, 2); 
            const material = new THREE.MeshPhongMaterial({ color: 0xa0a0a0 });
            const cube = new THREE.Mesh(geometry, material);
            scene.add(cube);
            // cube.rotation.y = (Math.random()-0.5)*1.4
            cube.position.set(i, 0.05, -11.5+Math.random()*1.4)
            g.add(cube);

            scene.add(g)
            // console.log(getOutline(cube))
            const outline = getOutline(cube)
            for (const o of outline){
                o.x += cube.position.x;
                o.y += cube.position.z;
            }
            durabilityOutlines.push(outline);

        }
        // console.log(durabilityOutlines)


    } else if (eventType == "maneuver"){
        const courseX = [[-4, -4, 2], [1, -2, 2], [-1.5, -2, 0]];

        for (const c of courseX){
            for (let a=c[1]; a<c[2]; a+=0.2){
                maneuverPosts.push(makeManeuverPost(c[0], a));
                // break
            }
        }
        const courseY = [[-4, -4, 1], [2, -4, 1], [-2, -1.5, 1]];
        for (const c of courseY){
            for (let a=c[1]; a<c[2]; a+=0.2){
                maneuverPosts.push(makeManeuverPost(a, c[0]));
                // break
            }
        }

        maneuverPosts.push(makeManeuverPost(0, -1, 0xff0000));
        
    }


}

if (eventType == "pull"){
    makeSled();
} else if (eventType == "maneuver"){

} else if (eventType == "durability"){
    makeLoadToad();
}


document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('mousedown', handleMouseDown);
document.addEventListener('mouseup', handleMouseUp);
renderer.domElement.addEventListener('click', handleClick);

makeEnvironment();
loadModel()
renderer.setAnimationLoop(animate);
