/**
 * This used to augment the LiteGraph types, either to fix them for how they actually behave
 * (e.g. marking args that are typed as required as optional because they actually are, etc.) or
 * adding properties/methods that rgthree-comfy adds/uses. Mostly the latter are prefixed 'rgthree_'
 * but not always.
 */
import "@comfyorg/frontend";

declare module "@comfyorg/frontend" {
  interface INodeSlot {
    // @rgthree: Hides a slot for rgthree-comfy draw methods.
    hidden?: boolean;

    // @rgthree: Used to "disable" an input/output. Used in PowerPrompt to disallow connecting
    // an output if there's no optional corresponding input (since, that would just break).
    disabled?: boolean;
    callback?: WidgetCallback<this>;
    /** Called by `LGraphCanvas.drawNodeWidgets` */
    draw?(
        ctx: CanvasRenderingContext2D,
        node: LGraphNode,
        width: number,
        posY: number,
        height: number
    ): void;
    /**
     * Called by `LGraphCanvas.processNodeWidgets`
     * https://github.com/jagenjo/litegraph.js/issues/76
     */
    mouse?(
        event: MouseEvent,
        pos: Vector2,
        node: LGraphNode
    ): boolean;
    /** Called by `LGraphNode.computeSize` */
    computeSize?(width: number): [number, number];
    // @rgthree - make optional, since it is in the code.
    serializeValue?(serializedNode: SerializedLGraphNode, widgetIndex: number): TValue;
    // @rgthree - Checked in LGraphCanvas.prototype.processNodeWidgets, and figured I'd use it too.
    width?: number;
}
export interface IButtonWidget extends IWidget<null, {}> {
    type: "button";
}
// @rgthree: adding options
export interface IToggleWidget extends IWidget<boolean, IWidgetToggleOptions> {
    type: "toggle";
}
// @rgthree: adding options
export interface ISliderWidget extends IWidget<number, IWidgetSliderOptions> {
    type: "slider";
}
// @rgthree: adding options
export interface INumberWidget extends IWidget<number, IWidgetNumberOptions> {
    type: "number";
}
// @rgthree: adding options
export interface IComboWidget extends IWidget<string[], IWidgetComboOptions> {
    value: T[0];
    type: "combo";
    callback?: WidgetComboCallback;
}

export interface ITextWidget extends IWidget<string, {}> {
    type: "text";
}

export interface IContextMenuItem {
    // @rgthree - Make optional because, I guess it is?
    content?: string;
    value?: any;
    callback?: ContextMenuEventListener;
    /** Used as innerHTML for extra child element */
    title?: string;
    disabled?: boolean;

    // @rgthree: A status we put on some nodes so we can draw things around it.
    rgthree_status?: "WARN" | "ERROR";
  }

  interface LGraph {
    // @rgthree (Fix): `result` arg is optional in impl.
    findNodesByType(type: string, result?: LGraphNode[]): LGraphNode[];
  }

  interface LGraphNode {
    // @rgthree: rgthree-comfy added this before comfyui did and it was a bit more flexible.
    removeWidget(widget: IBaseWidget|IWidget|number|undefined): void;

    // @rgthree (Fix): Implementation allows a falsy value to be returned and it will suppress the
    // menu all together.
    // NOTE: [🤮] We can't actually augment this because it's a return.. but keeping here because
    // this is how it's actually implemented.
    // getSlotMenuOptions?(this: LGraphNode, slot: IFoundSlot): IContextMenuValue[] | void;

    // @rgthree (Fix): Implementation allows a falsy value to be returned and it will not add items.
    // NOTE: [🤮] We can't actually augment this because it's a return.. but keeping here because
    // this is how it's actually implemented.
    // getExtraMenuOptions?(
    //   canvas: LGraphCanvas,
    //   options: (IContextMenuValue<unknown> | null)[],
    // ): (IContextMenuValue<unknown> | null)[] | void;
  }

  interface LGraphGroup {
    // @rgthree: Track whether a group has any active node from the fast group mode changers.
    rgthree_hasAnyActiveNode?: boolean;
  }

  interface LGraphCanvas {
    // @rgthree (Fix): At one point this was in ComfyUI's app.js. I don't see it now... perhaps it's
    // been removed? We were using it in rgthree-comfy.
    selected_group_moving?: boolean;

    // @rgthree (Fix): Allows LGraphGroup to be passed (it could be `{size: Point, pos: Point}`).
    centerOnNode(node: LGraphNode | LGraphGroup);

    // @rgthree (Fix): Makes item's fields optiona, and other params nullable, as well as adds
    // LGraphGroup to the node, since the implementation accomodates all of these as typed below.
    // NOTE: [🤮] We can't actually augment this because it's static.. but keeping here because
    // this is how it's actually implemented.
    // static onShowPropertyEditor(
    //   item: {
    //     property?: keyof LGraphNode | undefined;
    //     type?: string;
    //   },
    //   options: IContextMenuOptions<string> | null,
    //   e: MouseEvent | null,
    //   menu: ContextMenu<string> | null,
    //   node: LGraphNode | LGraphGroup,
    // ): void;
  }

  interface LGraphNodeConstructor {
    // @rgthree (Fix): Fixes ComfyUI-Frontend which marks this as required, even through even though
    // elsewhere it defines it as optional (like for the actual for LGraphNode).
    comfyClass?: string;

    // @rgthree: reference the original nodeType data as sometimes extensions clobber it.
    nodeType?: LGraphNodeConstructor | null;
  }
}

declare module "@/lib/litegraph/src/types/widgets" {
  interface IBaseWidget {
    // @rgthree (Fix): Where is this in Comfy types?
    inputEl?: HTMLInputElement;

    // @rgthree: A status we put on some nodes so we can draw things around it.
    rgthree_lastValue?: any;
  }
}

declare module "@/lib/litegraph/src/interfaces" {
  // @rgthree (Fix): widget is (or was?) available when inputs were moved from a widget.
  interface IFoundSlot {
    widget?: IBaseWidget;
  }
}

declare module "@comfyorg/litegraph/dist/LiteGraphGlobal" {
  interface LiteGraphGlobal {
    // @rgthree (Fix): Window is actually optional in the code.
    closeAllContextMenus(ref_window?: Window): void;
  }
}
