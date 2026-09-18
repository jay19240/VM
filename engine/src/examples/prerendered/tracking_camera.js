import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { UT } from '@lib/core/utils';
import { Gfx3ProjectionMode } from '@lib/gfx3/gfx3_view';
// ---------------------------------------------------------------------------------------

class TrackingCamera {
  constructor(viewIndex) {
    this.target = null;
    this.view = gfx3Manager.getView(viewIndex);
    this.view.setProjectionMode(Gfx3ProjectionMode.PERSPECTIVE);
  }

  async loadFromData(data) {
    this.view.setMinClipOffsetX(data['MinClipOffsetX']);
    this.view.setMinClipOffsetY(data['MinClipOffsetY']);
    this.view.setMaxClipOffsetX(data['MaxClipOffsetX']);
    this.view.setMaxClipOffsetY(data['MaxClipOffsetY']);
    this.view.setCameraMatrix(data['Matrix']);
    this.view.setPerspectiveFovy(UT.DEG_TO_RAD(parseInt(data['Fovy'])));
  }

  update(ts) {
    if (this.target) {
      this.view.clipToTarget(this.target.getPosition());
    }
  }

  setTarget(target) {
    this.target = target;
  }
}

export { TrackingCamera };