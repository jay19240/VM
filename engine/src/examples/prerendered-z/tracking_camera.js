import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { UT } from '@lib/core/utils';
import { Gfx3ProjectionMode } from '@lib/gfx3/gfx3_view';
// ---------------------------------------------------------------------------------------

class TrackingCamera {
  constructor(viewIndex) {
    this.view = gfx3Manager.getView(viewIndex);
    this.view.setProjectionMode(Gfx3ProjectionMode.PERSPECTIVE);
  }

  async loadFromData(data) {
    this.view.setCameraMatrix(data['Matrix']);
    this.view.setPerspectiveFovy(UT.DEG_TO_RAD(parseInt(data['Fovy'])));
    this.view.setPerspectiveNear(data['Near']);
    this.view.setPerspectiveFar(data['Far']);
  }
}

export { TrackingCamera };