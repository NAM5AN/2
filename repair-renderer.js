(function () {
  'use strict';
  const Original=window.MorbolViewer;
  class RepairedViewer extends Original {
    constructor(host,data,textures,options){
      super(host,data,textures,options);
      this.partVisible=Object.fromEntries(data.objects.filter(o=>!o.helper).map(o=>[o.id,true]));
    }
    current(){return this.objects.filter(o=>this.visible[o.group]&&this.partVisible[o.selection_id||o.id]);}
    getState(){
      const state=super.getState();
      state.visibleObjects=[...new Set(state.visibleObjects.map(id=>this.data.objects.find(o=>o.id===id)?.selection_id||id))];
      state.variant=this.data.variant;return state;
    }
    setGroupParts(group,on){for(const part of this.data.objects)if(part.group===group)this.partVisible[part.selection_id||part.id]=!!on;this.change();}
  }
  window.MorbolViewer=RepairedViewer;
})();
