// / <reference path='../node_modules/litegraph.js/src/litegraph.d.ts' />
// @ts-ignore
import {app} from '../../scripts/app.js';
// @ts-ignore
import {api} from '../../scripts/api.js';
// @ts-ignore
import { ComfyWidgets } from '../../scripts/widgets.js';
import type {LLink, IComboWidget, LGraphNode as TLGraphNode, LiteGraph as TLiteGraph, INodeOutputSlot, INodeInputSlot, Vector2} from './typings/litegraph.js';
import type {ComfyApp, ComfyObjectInfo, ComfyGraphNode} from './typings/comfy.js'
import {addConnectionLayoutSupport} from './utils.js';

declare const LiteGraph: typeof TLiteGraph;
declare const LGraphNode: typeof TLGraphNode;

/** Wraps a node instance keeping closure without mucking the finicky types. */
class PowerPrompt {

  readonly isSimple: boolean;
  readonly node: ComfyGraphNode;
  readonly promptEl: HTMLTextAreaElement;
  nodeData: ComfyObjectInfo;
  readonly combos: {[key:string]: IComboWidget} = {};
  readonly combosValues: {[key:string]: string[]} = {};
  boundOnFreshNodeDefs!: (event: CustomEvent) => void;

  constructor(node: ComfyGraphNode, nodeData: ComfyObjectInfo) {
    this.node = node;
    this.node.properties = this.node.properties || {};

    this.nodeData = nodeData;
    this.isSimple = this.nodeData.name.includes('Simple');

    this.promptEl = (node.widgets[0]! as any).inputEl;
    this.addAndHandleKeyboardLoraEditWeight();


    // this.findAndPatchCombos();
    this.patchNodeRefresh();

    const oldOnConnectionsChange = this.node.onConnectionsChange;
    this.node.onConnectionsChange = (type: number, slotIndex: number, isConnected: boolean, link_info: LLink, _ioSlot: (INodeOutputSlot | INodeInputSlot)) => {
      oldOnConnectionsChange?.apply(this.node, [type, slotIndex, isConnected, link_info,_ioSlot]);
      this.onNodeConnectionsChange(type, slotIndex, isConnected, link_info,_ioSlot);
    }

    const oldOnConnectInput = this.node.onConnectInput;
    this.node.onConnectInput = (inputIndex: number, outputType: INodeOutputSlot["type"], outputSlot: INodeOutputSlot, outputNode: TLGraphNode, outputIndex: number) => {
      let canConnect = true;
      if (oldOnConnectInput) {
        canConnect = oldOnConnectInput.apply(this.node, [inputIndex, outputType, outputSlot, outputNode,outputIndex]);
      }
      return canConnect && !this.node.inputs[inputIndex]!.disabled;
    }

    const oldOnConnectOutput = this.node.onConnectOutput;
    this.node.onConnectOutput = (outputIndex: number, inputType: INodeInputSlot["type"], inputSlot: INodeInputSlot, inputNode: TLGraphNode, inputIndex: number) => {
      let canConnect = true;
      if (oldOnConnectOutput) {
        canConnect = oldOnConnectOutput?.apply(this.node, [outputIndex, inputType, inputSlot, inputNode, inputIndex]);
      }
      return canConnect && !this.node.outputs[outputIndex]!.disabled;
    }

    // Strip all widgets but prompt (we'll re-add them in refreshCombos)
    this.node.widgets.splice(1);
    this.refreshCombos(nodeData);
    setTimeout(()=> {
      this.stabilizeInputsOutputs();
    }, 32);
  }

  /**
   * Cleans up optional out puts when we don't have the optional input. Purely a vanity function.
   */
  onNodeConnectionsChange(_type: number, _slotIndex: number, _isConnected: boolean, _linkInfo: LLink, _ioSlot: (INodeOutputSlot | INodeInputSlot)) {
    this.stabilizeInputsOutputs();
  }

  private stabilizeInputsOutputs() {
    // If our first input is connected, then we can show the proper output.
    const clipLinked = this.node.inputs.some(i=>i.name.includes('clip') && !!i.link);
    const modelLinked = this.node.inputs.some(i=>i.name.includes('model') && !!i.link);
    for (const [index, output] of this.node.outputs.entries()) {
      const type = (output.type as string).toLowerCase();
      if (type.includes('model')) {
        output.disabled = !modelLinked;
      } else if (type.includes('conditioning')) {
        output.disabled = !clipLinked;
      } else if (type.includes('clip')) {
        output.disabled = !clipLinked;
      } else if (type.includes('string')) {
        // Our text prompt is always enabled, but let's color it so it stands out
        // if the others are disabled. #7F7 is Litegraph's default.
        output.color_off = '#7F7';
        output.color_on = '#7F7';
      }
      if (output.disabled) {
        // this.node.disconnectOutput(index);
      }
    }
  }

  onFreshNodeDefs(event: CustomEvent) {
    this.refreshCombos(event.detail[this.nodeData.name]);
  }

  findAndPatchCombos() {
    // for (const widget of this.node.widgets) {
    //   if (widget.type === 'combo' && widget.name!.startsWith('insert_')) {
    //     widget.callback = (selected) => this.onPromptComboCallback(widget as IComboWidget, selected);
    //     if (widget.options.values.length === 1) {
    //       widget.disabled = true;
    //     }
    //     // Override comput size so we can add some padding after the last widget. Not sure why it's
    //     // funky, perhaps the multiline text area.
    //     (widget as any).oldComputeSize = widget.computeSize;
    //     let node = this.node;
    //     widget.computeSize = function(width: number) {
    //       const size = (this as any).oldComputeSize?.(width) || [width, LiteGraph.NODE_WIDGET_HEIGHT];
    //       if (this === node.widgets[node.widgets.length- 1]) {
    //         size[1] += 10;
    //       }
    //       return size;
    //     };
    //   }
    // }
  }

  onPromptComboCallback(widget: IComboWidget, selected: string) {
    const values = widget.options.values as string[];
    if (selected !== values[0] && !selected.match(/^disable\s[a-z]/i)) {
      if (widget.name!.includes('embedding')) {
        this.insertText(`embedding:${selected}`);
      } else if (widget.name!.includes('saved')) {
        this.insertText(this.combosValues[`saved_${widget.name!}`]![values.indexOf(selected)]!);
      } else if (widget.name!.includes('lora')) {
        this.insertText(`<lora:${selected}:1.0>`);
      }
    }
  }



  refreshCombos(nodeData: ComfyObjectInfo) {

    this.nodeData = nodeData;
    // Add the combo for hidden inputs of nodeData
    let data = this.nodeData.input?.optional || {};
    data = Object.assign(data, this.nodeData.input?.hidden || {});

    for (const [key, value] of Object.entries(data)) {//Object.entries(this.nodeData.input?.hidden || {})) {
      if (Array.isArray(value[0])) {
        const values = value[0] as string[];
        if (key.startsWith('insert')) {
          const shouldShow = values.length > 2 || (values.length > 1 && !values[1]!.match(/^disable\s[a-z]/i))
          if (shouldShow) {
            if (!this.combos[key]) {
              this.combos[key] = this.node.addWidget('combo', key, values, (selected) => {
                if (selected !== values[0] && !selected.match(/^disable\s[a-z]/i)) {
                  if (key.includes('embedding')) {
                    this.insertText(`embedding:${selected}`);
                  } else if (key.includes('saved')) {
                    this.insertText(this.combosValues[`values_${key}`]![values.indexOf(selected)]!);
                  } else if (key.includes('lora')) {
                    this.insertText(`<lora:${selected}:1.0>`);
                  }
                  this.combos[key]!.value = values[0];
                }
              }, {
                values,
                serialize: true, // Don't include this in prompt.
              });
              (this.combos[key]! as any).oldComputeSize = this.combos[key]!.computeSize;
              let node = this.node;
              this.combos[key]!.computeSize = function(width: number) {
                const size = (this as any).oldComputeSize?.(width) || [width, LiteGraph.NODE_WIDGET_HEIGHT];
                if (this === node.widgets[node.widgets.length- 1]) {
                  size[1] += 10;
                }
                return size;
              };
            }
            this.combos[key]!.options.values = values;
            this.combos[key]!.value = values[0];
          } else if (!shouldShow && this.combos[key]) {
            this.node.widgets.splice(this.node.widgets.indexOf(this.combos[key]!), 1);
            delete this.combos[key];
          }

        } else if (key.startsWith('values')) {
          this.combosValues[key] = values;
        }
      }
    }
  }

  insertText(text: string) {
    if (this.promptEl) {
      let prompt = this.promptEl.value;
      let first = prompt.substring(0, this.promptEl.selectionStart).replace(/ +$/, '');
      first = first + (['\n'].includes(first[first.length-1]!) ? '' : first.length ? ' ' : '');
      let second = prompt.substring(this.promptEl.selectionEnd).replace(/^ +/, '');
      second = (['\n'].includes(second[0]!) ? '' : second.length ? ' ' : '') + second;
      this.promptEl.value = first + text + second;
      this.promptEl.focus();
      this.promptEl.selectionStart = first.length;
      this.promptEl.selectionEnd = first.length + text.length;
    }
  }

  /**
   * Adds a keydown event listener to our prompt so we can see if we're using the
   * ctrl/cmd + up/down arrows shortcut. This kind of competes with the core extension
   * "Comfy.EditAttention" but since that only handles parenthesis and listens on window, we should
   * be able to intercept and cancel the bubble if we're doing the same action within the lora tag.
   */
  addAndHandleKeyboardLoraEditWeight() {
    this.promptEl.addEventListener('keydown',  (event: KeyboardEvent)=> {
      // If we're not doing a ctrl/cmd + arrow key, then bail.
      if (!(event.key === "ArrowUp" || event.key === "ArrowDown")) return;
      if (!event.ctrlKey && !event.metaKey) return;
      // Unfortunately, we can't see Comfy.EditAttention delta in settings, so we hardcode to 0.01.
      // We can acutally do better too, let's make it .1 by default, and .01 if also holding shift.
      const delta = event.shiftKey ? .01 : .1;

      let start = this.promptEl.selectionStart;
      let end = this.promptEl.selectionEnd;
      let fullText = this.promptEl.value;
      let selectedText = fullText.substring(start, end);

      // We don't care about fully rewriting Comfy.EditAttention, we just want to see if our
      // selected text is a lora, which will always start with "<lora:". So work backwards until we
      // find something that we know can't be a lora, or a "<".
      if (!selectedText) {
        const stopOn = "<>() \r\n\t";
        if (fullText[start] == '>') {
          start-=2;
          end-=2;
        }
        if (fullText[end-1] == '<') {
          start+=2;
          end+=2;
        }
        while (!stopOn.includes(fullText[start]!) && start > 0) {
          start--;
        }
        while (!stopOn.includes(fullText[end-1]!) && end < fullText.length) {
          end++;
        }
        selectedText = fullText.substring(start, end);
      }

      // Bail if this isn't a lora.
      if (!selectedText.startsWith('<lora:') || !selectedText.endsWith('>')) {
        return;
      }

      let weight = Number(selectedText.match(/:(-?\d*(\.\d*)?)>$/)?.[1]) ?? 1;
      weight += event.key === "ArrowUp" ? delta : -delta;
      const updatedText = selectedText.replace(/(:-?\d*(\.\d*)?)?>$/, `:${weight.toFixed(2)}>`);

      // Handle the new value and cancel the bubble so Comfy.EditAttention doesn't also try.
      this.promptEl.setRangeText(updatedText, start, end, 'select');
      event.preventDefault();
      event.stopPropagation();
    });
  }

  /**
   * Patches over api.getNodeDefs in comfy's api.js to fire a custom event that we can listen to
   * here and manually refresh our combos when a request comes in to fetch the node data; which
   * only happens once at startup (but before custom nodes js runs), and then after clicking
   * the "Refresh" button in the floating menu, which is what we care about.
   */
  patchNodeRefresh()  {
    this.boundOnFreshNodeDefs = this.onFreshNodeDefs.bind(this);
    api.addEventListener('fresh-node-defs', this.boundOnFreshNodeDefs);
    const oldNodeRemoved = this.node.onRemoved;
    this.node.onRemoved = () => {
      oldNodeRemoved?.call(this.node);
      api.removeEventListener('fresh-node-defs', this.boundOnFreshNodeDefs);
    }
  }
}

let nodeData: ComfyObjectInfo | null = null;
app.registerExtension({
	name: 'rgthree.PowerPrompt',
	async beforeRegisterNodeDef(nodeType: typeof LGraphNode, passedNodeData: ComfyObjectInfo, _app: ComfyApp) {
		if (passedNodeData.name.startsWith('Power Prompt') && passedNodeData.name.includes('rgthree')) {
      nodeData = passedNodeData;

			const onNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function () {
				onNodeCreated ? onNodeCreated.apply(this, []) : undefined;
        (this as any).powerPrompt = new PowerPrompt(this as ComfyGraphNode, passedNodeData);
      }

      // This won't actually work until such a thing exists in app.js#refreshComboInNodes
      // @ts-ignore
      // nodeType.prototype.onRefreshCombos = function (newNodeData: any) {
      //   (this as any).powerPrompt.refreshCombos(newNodeData);
      // }

      // This isn't super useful, because R->L removes the names in order to work with
      // litegraph's hardcoded L->R math.. but, ¯\_(ツ)_/¯
      addConnectionLayoutSupport(nodeType, app, [['Left', 'Right'], ['Right', 'Left']]);
		}
	},
  async loadedGraphNode(node: TLGraphNode) {
		if (node.type === 'Power Prompt (rgthree)') {
      setTimeout(() => {
        // If the first output is STRING, then it's the text output from the initial launch.
        // Let's port it to the new
        if (node.outputs[0]!.type === 'STRING') {
          if (node.outputs[0]!.links) {
            node.outputs[3]!.links = node.outputs[3]!.links || [];
            for (const link of node.outputs[0]!.links) {
              node.outputs[3]!.links.push(link);
              app.graph.links[link].origin_slot = 3;
            }
            node.outputs[0]!.links = null;
          }
          node.outputs[0]!.type = nodeData!.output![0] as string;
          node.outputs[0]!.name = nodeData!.output_name![0] || node.outputs[0]!.type as string;
          node.outputs[0]!.color_on = undefined;
          node.outputs[0]!.color_off = undefined;
        }
      }, 50)
    }
  }
});