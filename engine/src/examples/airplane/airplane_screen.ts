import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3DebugRenderer } from '@lib/gfx3/gfx3_debug_renderer';
import { UT } from '@lib/core/utils';
import { Screen } from '@lib/screen/screen';
import { Gfx3Camera } from '@lib/gfx3_camera/gfx3_camera';
import { inputManager } from '@lib/input/input_manager';

// Caméra
const CAMERA_DISTANCE = 12;
const CAMERA_HEIGHT = 4;
const CAMERA_LERP = 0.08;

// Vol
const MIN_SPEED = 0.005;
const MAX_SPEED = 0.04;
const THROTTLE_RATE = 0.00002;
const THROTTLE_DAMPING = 0.00001;

// Orientation
const MAX_ROLL = Math.PI * 0.45;   // angle de roulis max
const MAX_PITCH = Math.PI * 0.35;  // angle de tangage max
const ROLL_SPEED = 2.5;            // vitesse de mise en virage
const PITCH_SPEED = 1.2;           // vitesse de cabrage
const ROLL_RECENTER = 0.04;        // ramène le roulis au neutre
const PITCH_RECENTER = 0.03;       // ramène le tangage au neutre
const TURN_RATE = 1.6;             // conversion roulis -> lacet

// Sol
const GROUND_Y = 0;

interface Airplane {
  pos: vec3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  forward: vec3;
  matrix: mat4;
  size: vec3;
};

class AirplaneScreen extends Screen {
  camera: Gfx3Camera;
  camFollowPos: vec3;
  airplane: Airplane;
  minPlane: vec3;
  maxPlane: vec3;

  constructor() {
    super();
    this.camera = new Gfx3Camera(0);
    this.camFollowPos = [0, 0, 0];

    this.airplane = {
      pos: [0, 20, 0],
      yaw: 0,
      pitch: 0,
      roll: 0,
      speed: 0.015,
      forward: [0, 0, -1],
      matrix: UT.MAT4_IDENTITY(),
      size: [3.5, 0.6, 2.2]
    };

    this.minPlane = [-this.airplane.size[0] / 2, -this.airplane.size[1] / 2, -this.airplane.size[2] / 2];
    this.maxPlane = [this.airplane.size[0] / 2, this.airplane.size[1] / 2, this.airplane.size[2] / 2];
  }

  async onEnter(): Promise<void> {
    this.camFollowPos = [
      this.airplane.pos[0],
      this.airplane.pos[1] + CAMERA_HEIGHT,
      this.airplane.pos[2] + CAMERA_DISTANCE
    ];
  }

  update(ts: number): void {
    this.updateOrientation(ts);
    this.updateThrottle(ts);
    this.updateForward();
    this.updatePosition(ts);
    this.updateGround();
    this.updateTransform();
    this.updateCamera();
  }

  updateOrientation(ts: number): void {
    const dt = ts / 1000;

    if (inputManager.isActiveAction('LEFT')) {
      this.airplane.roll = UT.LERP(this.airplane.roll, MAX_ROLL, ROLL_SPEED * dt);
    }
    else if (inputManager.isActiveAction('RIGHT')) {
      this.airplane.roll = UT.LERP(this.airplane.roll, -MAX_ROLL, ROLL_SPEED * dt);
    }
    else {
      this.airplane.roll = UT.LERP(this.airplane.roll, 0, ROLL_RECENTER);
    }

    if (inputManager.isActiveAction('UP')) {
      this.airplane.pitch = UT.LERP(this.airplane.pitch, -MAX_PITCH, PITCH_SPEED * dt);
    }
    else if (inputManager.isActiveAction('DOWN')) {
      this.airplane.pitch = UT.LERP(this.airplane.pitch, MAX_PITCH, PITCH_SPEED * dt);
    }
    else {
      this.airplane.pitch = UT.LERP(this.airplane.pitch, 0, PITCH_RECENTER);
    }

    // Le roulis induit un virage en lacet (l'aile basse tire vers ce côté).
    this.airplane.yaw -= Math.sin(this.airplane.roll) * TURN_RATE * dt;
  }

  updateThrottle(ts: number): void {
    if (inputManager.isActiveAction('SELECT')) {
      this.airplane.speed += THROTTLE_RATE * ts;
    }
    else if (inputManager.isActiveAction('BACK')) {
      this.airplane.speed -= THROTTLE_RATE * ts;
    }
    else {
      this.airplane.speed -= THROTTLE_DAMPING * ts;
      this.airplane.speed = Math.max(this.airplane.speed, MIN_SPEED);
    }

    this.airplane.speed = UT.CLAMP(this.airplane.speed, MIN_SPEED, MAX_SPEED);
  }

  updateForward(): void {
    this.airplane.forward = UT.VEC3_FORWARD_NEGATIVE_Z(this.airplane.pitch, this.airplane.yaw);
  }

  updatePosition(ts: number): void {
    this.airplane.pos[0] += this.airplane.forward[0] * this.airplane.speed * ts;
    this.airplane.pos[1] += this.airplane.forward[1] * this.airplane.speed * ts;
    this.airplane.pos[2] += this.airplane.forward[2] * this.airplane.speed * ts;
  }

  updateGround(): void {
    const minAltitude = GROUND_Y + this.airplane.size[1];
    if (this.airplane.pos[1] < minAltitude) {
      this.airplane.pos[1] = minAltitude;
      if (this.airplane.pitch < 0) {
        this.airplane.pitch = 0;
      }
    }
  }

  updateTransform(): void {
    this.airplane.matrix = UT.MAT4_TRANSFORM(
      this.airplane.pos,
      [this.airplane.pitch, this.airplane.yaw, this.airplane.roll],
      [1, 1, 1]
    );
  }

  updateCamera(): void {
    const camTargetPos: vec3 = [
      this.airplane.pos[0] - this.airplane.forward[0] * CAMERA_DISTANCE,
      this.airplane.pos[1] + CAMERA_HEIGHT,
      this.airplane.pos[2] - this.airplane.forward[2] * CAMERA_DISTANCE
    ];

    this.camFollowPos[0] = UT.LERP(this.camFollowPos[0], camTargetPos[0], CAMERA_LERP);
    this.camFollowPos[1] = UT.LERP(this.camFollowPos[1], camTargetPos[1], CAMERA_LERP);
    this.camFollowPos[2] = UT.LERP(this.camFollowPos[2], camTargetPos[2], CAMERA_LERP);

    this.camera.setPosition(this.camFollowPos[0], this.camFollowPos[1], this.camFollowPos[2]);

    this.camera.lookAt(
      this.airplane.pos[0] + this.airplane.forward[0] * 5,
      this.airplane.pos[1] + this.airplane.forward[1] * 5,
      this.airplane.pos[2] + this.airplane.forward[2] * 5
    );
  }

  draw(): void {
    gfx3Manager.beginDrawing();

    // Grille au sol pour visualiser le déplacement.
    gfx3DebugRenderer.drawGrid(
      UT.MAT4_ROTATE_X(Math.PI * 0.5),
      100,
      10,
      [0.15, 0.15, 0.2]
    );

    // Repères de scène.
    for (let x = -80; x <= 80; x += 40) {
      for (let z = -80; z <= 80; z += 40) {
        gfx3DebugRenderer.drawCylinder(
          UT.MAT4_TRANSLATE(x, GROUND_Y, z),
          1,
          15,
          8,
          false,
          [0.2, 0.5, 0.3]
        );
      }
    }

    // Avion : box + ailes + gizmo.
    gfx3DebugRenderer.drawBoundingBox(this.airplane.matrix, this.minPlane, this.maxPlane, [0, 1, 1]);
    this.drawWings();
    gfx3DebugRenderer.drawGizmo(this.airplane.matrix, 2);

    gfx3Manager.endDrawing();
  }

  drawWings(): void {
    const halfSpan = 4;
    const tailLength = 2.5;

    const wing: Array<number> = [
      -halfSpan, 0, 0, 1, 1, 1,
      halfSpan, 0, 0, 1, 1, 1
    ];

    const tail: Array<number> = [
      0, 0, this.airplane.size[2] / 2, 1, 1, 1,
      0, 0, this.airplane.size[2] / 2 + tailLength, 1, 1, 1,
      -1, 0, this.airplane.size[2] / 2 + tailLength, 1, 1, 1,
      1, 0, this.airplane.size[2] / 2 + tailLength, 1, 1, 1,
      0, 0, this.airplane.size[2] / 2 + tailLength, 1, 1, 1,
      0, 1.2, this.airplane.size[2] / 2 + tailLength, 1, 1, 1
    ];

    gfx3DebugRenderer.drawVertices(wing, 2, this.airplane.matrix);
    gfx3DebugRenderer.drawVertices(tail, 6, this.airplane.matrix);
  }

  render(): void {
    gfx3Manager.beginRender();
    gfx3Manager.beginPassRender(0);
    gfx3DebugRenderer.render();
    gfx3Manager.endPassRender();
    gfx3Manager.endRender();
  }
}

export { AirplaneScreen };

