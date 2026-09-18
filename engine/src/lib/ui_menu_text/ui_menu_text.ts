import { UIMenu } from '../ui_menu/ui_menu';
import { UIWidget } from '../ui/ui_widget';
import { UIMenuAxis } from '../ui_menu/ui_menu';
import { UIMenuTextItem } from './ui_menu_text_item';
import { eventManager } from '../core/event_manager';
import { gfx2TextureManager } from '../gfx2/gfx2_texture_manager';
import { spritesheetManager } from '../core/spritesheet_manager';
import { FormatJAS, getSpriteAnimation } from '../core/format_jas';

/**
 * Menu simple composé d'éléments textuels ou d'images issues d'une feuille de sprites.
 * Émet les mêmes événements que {@link UIMenu}.
 */
export class UIMenuText extends UIMenu {
  spritesheetImageUrl: string | null;
  spritesheetJAS: FormatJAS | null;
  spritesheetWidth: number;
  spritesheetHeight: number;
  animationNamesByIds: Map<string, string>;
  animationNamesByIdsOnFocus: Map<string, string>;
  previousImageItemFocused: UIWidget | null;

  /**
   * Crée un menu textuel.
   *
   * @param options - Axe de navigation et classe CSS du menu.
   */
  constructor(options: { axis?: UIMenuAxis, className?: string } = {}) {
    super(Object.assign(options, {
      className: options.className ?? 'UIMenuText'
    }));

    this.spritesheetImageUrl = null;
    this.spritesheetJAS = null;
    this.spritesheetWidth = 0;
    this.spritesheetHeight = 0;
    this.animationNamesByIds = new Map();
    this.animationNamesByIdsOnFocus = new Map();
    this.previousImageItemFocused = null;

    eventManager.subscribe(this, 'E_ITEM_FOCUSED', this, this.handleItemFocused);
  }

  /** Libère l'abonnement au changement de focus et les ressources du menu parent. */
  delete() {
    eventManager.unsubscribe(this, 'E_ITEM_FOCUSED', this.handleItemFocused);
    super.delete();
  }

  /**
   * Ajoute un élément textuel au menu.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @param {string} text - Texte à afficher.
   */
  add(id: string, text: string): void {
    const item = new UIMenuTextItem();
    item.setId(id);
    item.setText(text);
    this.addWidget(item);
  }

  /**
   * Modifie le texte d'un élément du menu.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @param {string} text - Nouveau texte.
   * @throws {Error} Si aucun élément ne possède cet identifiant.
   */
  set(id: string, text: string): void {
    const item = this.widgets.find(w => w.getId() == id) as UIMenuTextItem;
    if (!item) {
      throw new Error('UIMenuText::set(): item not found !');
    }

    item.setText(text);
  }

  /**
   * Configure la feuille de sprites utilisée par les éléments illustrés.
   *
   * @param {string} imagePath - Chemin d'une texture préalablement chargée.
   * @param {string} jasPath - Chemin des données JAS préalablement chargées.
   */
  setSpritesheet(imagePath: string, jasPath: string): void {
    const texture = gfx2TextureManager.getTexture(imagePath);
    this.spritesheetImageUrl = gfx2TextureManager.getTextureURL(imagePath);
    this.spritesheetJAS = spritesheetManager.getSpritesheet(jasPath);
    this.spritesheetWidth = texture.width;
    this.spritesheetHeight = texture.height;
  }

  /**
   * Ajoute un élément illustré avec une animation normale et une animation de focus.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @param {string} animationName - Nom de l'animation affichée au repos.
   * @param {string} animationNameOnFocus - Nom de l'animation affichée lorsque l'élément possède le focus.
   * @throws {Error} Si la feuille de sprites n'a pas été configurée.
   */
  addImageItem(id: string, animationName: string, animationNameOnFocus: string): void {
    if (!this.spritesheetImageUrl || !this.spritesheetJAS) {
      throw new Error('UIMenuText::addImageItem(): spritesheet not set !');
    }

    const item = new UIMenuTextItem();
    item.setId(id);
    item.setText('');

    const anim = getSpriteAnimation(this.spritesheetJAS, animationName);
    if (anim) {
      item.node.style.backgroundImage = `url(${this.spritesheetImageUrl})`;
      item.node.style.backgroundPositionX = -anim['Frames'][0]['X'] + 'px';
      item.node.style.backgroundPositionY = -anim['Frames'][0]['Y'] + 'px';
      item.node.style.width = anim['Frames'][0]['Width'] + 'px';
      item.node.style.height = anim['Frames'][0]['Height'] + 'px';
      item.node.style.backgroundSize = `${this.spritesheetWidth}px ${this.spritesheetHeight}px`;
    }

    this.animationNamesByIds.set(id, animationName);
    this.animationNamesByIdsOnFocus.set(id, animationNameOnFocus);
    this.addWidget(item);
  }

  /**
   * Retire un élément du menu.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @throws {Error} Si aucun élément ne possède cet identifiant.
   */
  remove(id: string): void {
    const widgetIndex = this.widgets.findIndex(w => w.getId() == id);
    if (widgetIndex == -1) {
      throw new Error('UIMenuText::remove(): item not found !');
    }

    this.removeWidget(widgetIndex);
  }

  /**
   * Renvoie l'identifiant de l'élément sélectionné.
   *
   * @returns L'identifiant sélectionné, ou `null` si la sélection est vide.
   */
  getSelectedId(): string | null {
    return this.getSelectedWidgetId();
  }

  /**
   * Met à jour l'image des éléments illustrés lors d'un changement de focus.
   *
   * @param data - Données de l'événement contenant l'identifiant et l'indice de l'élément actif.
   */
  handleItemFocused(data: any) {
    if (!this.spritesheetJAS) {
      return;
    }
    if (!this.animationNamesByIds.has(data.id)) {
      return;
    }

    if (this.previousImageItemFocused) {
      const animationName = this.animationNamesByIds.get(this.previousImageItemFocused.getId())!;
      const animation = getSpriteAnimation(this.spritesheetJAS, animationName);

      this.previousImageItemFocused.node.style.backgroundPositionX = -animation['Frames'][0]['X'] + 'px';
      this.previousImageItemFocused.node.style.backgroundPositionY = -animation['Frames'][0]['Y'] + 'px';
      this.previousImageItemFocused.node.style.width = animation['Frames'][0]['Width'] + 'px';
      this.previousImageItemFocused.node.style.height = animation['Frames'][0]['Height'] + 'px';
    }

    const animationName = this.animationNamesByIdsOnFocus.get(data.id)!;
    const animation = getSpriteAnimation(this.spritesheetJAS, animationName);

    const item = this.widgets[data.index];
    item.node.style.backgroundPositionX = -animation['Frames'][0]['X'] + 'px';
    item.node.style.backgroundPositionY = -animation['Frames'][0]['Y'] + 'px';
    item.node.style.width = animation['Frames'][0]['Width'] + 'px';
    item.node.style.height = animation['Frames'][0]['Height'] + 'px';

    this.previousImageItemFocused = item;
  }
}