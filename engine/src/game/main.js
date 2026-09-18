import { em } from '@lib/legacy';
import { screenManager } from '@lib/legacy';
import { gfx3DebugRenderer } from '@lib/legacy';
// ---------------------------------------------------------------------------------------
import { GameScreen } from './game_screen';
// ---------------------------------------------------------------------------------------

em.showStats(true);
em.startup();

screenManager.requestSetScreen(new GameScreen());
gfx3DebugRenderer.setShowDebug(true);