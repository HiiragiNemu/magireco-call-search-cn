import {
  handleStoryRouterRequest,
  isAdvHandoffEnabled,
} from './_runtime/story-router.js';
import {
  STORY_ROUTE_INDEX,
  STORY_ROUTER_TARGETS,
} from './_generated/story-routes.js';

const DEFAULT_READER_BASE_URL = 'https://magireader.pages.dev/';
const DEFAULT_ADV_BASE_URL = 'https://magiaexedralive2dviewer.pages.dev/';
const DEFAULT_SPRITE_BASE_URL = '/sprite-viewer/';

export default function onRequest(context) {
  const enabledValue = context.env?.AIO_ADV_HANDOFF_ENABLED;
  return handleStoryRouterRequest(context.request, STORY_ROUTE_INDEX, {
    readerBaseUrl: context.env?.AIO_READER_BASE_URL || DEFAULT_READER_BASE_URL,
    advBaseUrl: context.env?.AIO_ADV_BASE_URL || DEFAULT_ADV_BASE_URL,
    spriteBaseUrl: context.env?.AIO_SPRITE_BASE_URL || DEFAULT_SPRITE_BASE_URL,
    advRenderer: context.env?.AIO_ADV_RENDERER || 'pixi-v2',
    advReaderRevision: STORY_ROUTER_TARGETS.adv.readerRevision,
    advHandoffEnabled: isAdvHandoffEnabled(
      STORY_ROUTER_TARGETS.adv.handoffReady,
      enabledValue,
    ),
  });
}
