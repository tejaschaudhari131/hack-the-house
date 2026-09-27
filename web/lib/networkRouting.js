import { haversineMeters } from './geo.js'

const indexes = new WeakMap(), CELL = .002
const key = (a,b) => a < b ? `${a}:${b}` : `${b}:${a}`
function edgeIndex(network) {
  if (indexes.has(network)) return indexes.get(network)
  const edges = new Map(), cells = new Map()
  for (const [from,to,cost,ground] of network.edges) {
    if (!Number.isFinite(cost) || cost < 0 || from === to) continue
    const id=key(from,to), a=Math.min(from,to), b=Math.max(from,to)
    if (!edges.has(id)) edges.set(id,{a,b,forward:Infinity,reverse:Infinity,ground:false})
    const e=edges.get(id), direction=from===a?'forward':'reverse'
    e.ground ||= ground === undefined ? Boolean(network.ground[a] && network.ground[b]) : ground === 1
    e[direction]=Math.min(e[direction],cost)
  }
  for (const [id,e] of edges) {
    if (!e.ground || !network.ground[e.a] || !network.ground[e.b]) continue
    const a=network.nodes[e.a], b=network.nodes[e.b]
    for(let x=Math.floor(Math.min(a[0],b[0])/CELL);x<=Math.floor(Math.max(a[0],b[0])/CELL);x++)
      for(let y=Math.floor(Math.min(a[1],b[1])/CELL);y<=Math.floor(Math.max(a[1],b[1])/CELL);y++) {
        const cell=`${x}:${y}`; if(!cells.has(cell)) cells.set(cell,[]); cells.get(cell).push(id)
      }
  }
  const result={edges,cells}; indexes.set(network,result); return result
}

/** A junction is a source node or a fraction along a real, ground-level edge. */
export function endpointCoordinates(network, endpoint) {
  if (!network) return null
  if(Number.isInteger(endpoint)) return network.ground[endpoint] ? network.nodes[endpoint] || null : null
  const [a,b]=endpoint?.edge || []
  if(!Number.isInteger(a)||!Number.isInteger(b)||a>=b||!Number.isFinite(endpoint.t)||endpoint.t<0||endpoint.t>1) return null
  if(!network.ground[a]||!network.ground[b]||!edgeIndex(network).edges.get(key(a,b))?.ground) return null
  const p=network.nodes[a],q=network.nodes[b]
  return [p[0]+(q[0]-p[0])*endpoint.t,p[1]+(q[1]-p[1])*endpoint.t]
}

/** Project onto nearby segments, not just sparse OSM vertices; never snap to bridges/tunnels. */
export function snapToEdge(network, point, maxM=35) {
  if(!network||!point||point.length!==2||!point.every(Number.isFinite)) return null
  const {edges,cells}=edgeIndex(network), sx=111320*Math.cos(point[1]*Math.PI/180), sy=111320
  const candidates=new Set()
  for(let x=Math.floor((point[0]-maxM/sx)/CELL);x<=Math.floor((point[0]+maxM/sx)/CELL);x++)
    for(let y=Math.floor((point[1]-maxM/sy)/CELL);y<=Math.floor((point[1]+maxM/sy)/CELL);y++)
      for(const id of cells.get(`${x}:${y}`)||[]) candidates.add(id)
  let best=null
  for(const id of candidates) {
    const {a,b}=edges.get(id),p=network.nodes[a],q=network.nodes[b]
    const dx=(q[0]-p[0])*sx,dy=(q[1]-p[1])*sy,den=dx*dx+dy*dy
    if(!den) continue
    const t=Math.max(0,Math.min(1,((point[0]-p[0])*sx*dx+(point[1]-p[1])*sy*dy)/den))
    const coordinates=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t],distance=haversineMeters(...point,...coordinates)
    if(distance<=maxM && (!best||distance<best.distance)) best={endpoint:t<1e-9?a:t>1-1e-9?b:{edge:[a,b],t},coordinates,distance}
  }
  return best
}

/** Split only touched edges. Direction and proportional source travel costs are preserved. */
export function graphWithJunctions(prepared, endpoints=[], connections=[]) {
  const {network,adjacency}=prepared, nodes=network.nodes.slice(), changes=new Map(), groups=new Map(), ids=new Map()
  const identity=e=>Number.isInteger(e)?String(e):`${e.edge.join(':')}:${e.t}`
  const all=[...endpoints,...connections.flatMap(c=>[c.from,c.to])]
  for(const e of all) {
    if(!endpointCoordinates(network,e)) continue
    if(Number.isInteger(e)) { ids.set(identity(e),e); continue }
    const {a,b}=edgeIndex(network).edges.get(key(...e.edge)), id=identity(e)
    if(ids.has(id)) continue
    if(e.t===0||e.t===1) {ids.set(id,e.t===0?a:b);continue}
    const node=nodes.length; nodes.push(endpointCoordinates(network,e));ids.set(id,node);changes.set(node,[])
    const k=key(a,b);if(!groups.has(k)) groups.set(k,[]);groups.get(k).push({node,t:e.t})
  }
  const list=node=>{if(!changes.has(node)) changes.set(node,[...(adjacency[node]||[])]);return changes.get(node)}
  for(const [id,interior] of groups) {
    const e=edgeIndex(network).edges.get(id),ordered=[{node:e.a,t:0},...interior.sort((a,b)=>a.t-b.t),{node:e.b,t:1}]
    changes.set(e.a,list(e.a).filter(([to])=>to!==e.b));changes.set(e.b,list(e.b).filter(([to])=>to!==e.a))
    for(let i=1;i<ordered.length;i++) {
      const p=ordered[i-1],q=ordered[i],part=q.t-p.t
      if(Number.isFinite(e.forward)) list(p.node).push([q.node,e.forward*part])
      if(Number.isFinite(e.reverse)) list(q.node).push([p.node,e.reverse*part])
    }
  }
  for(const c of connections) {
    const a=ids.get(identity(c.from)),b=ids.get(identity(c.to))
    if(a===undefined||b===undefined) continue
    const minutes=haversineMeters(...nodes[a],...nodes[b])/80
    list(a).push([b,minutes]);list(b).push([a,minutes])
  }
  return {nodes,neighbors:node=>changes.get(node)||adjacency[node]||[],endpointId:e=>ids.get(identity(e))}
}

class Heap {
  data=[]
  push(item) {let i=this.data.length;this.data.push(item);while(i){const p=(i-1)>>1;if(this.data[p][0]<=item[0])break;this.data[i]=this.data[p];i=p}this.data[i]=item}
  pop() {const first=this.data[0],last=this.data.pop();if(this.data.length){let i=0;while(i*2+1<this.data.length){let c=i*2+1;if(c+1<this.data.length&&this.data[c+1][0]<this.data[c][0])c++;if(this.data[c][0]>=last[0])break;this.data[i]=this.data[c];i=c}this.data[i]=last}return first}
}
export function traverseGraph(graph, origin, target=null) {
  const distances=new Float64Array(graph.nodes.length).fill(Infinity),previous=new Int32Array(graph.nodes.length).fill(-1)
  if(!Number.isInteger(origin)||!graph.nodes[origin]) return {distances,previous,nodes:graph.nodes}
  const queue=new Heap();distances[origin]=0;queue.push([0,origin])
  while(queue.data.length) {
    const [time,node]=queue.pop();if(time!==distances[node])continue;if(node===target)break
    for(const [next,cost] of graph.neighbors(node)) if(time+cost<distances[next]){distances[next]=time+cost;previous[next]=node;queue.push([time+cost,next])}
  }
  return {distances,previous,nodes:graph.nodes}
}
export function routeBetween(prepared, from, to) {
  if(!prepared||!endpointCoordinates(prepared.network,from)||!endpointCoordinates(prepared.network,to)) return null
  const graph=graphWithJunctions(prepared,[from,to]),start=graph.endpointId(from),end=graph.endpointId(to)
  const {distances,previous}=traverseGraph(graph,start,end)
  if(!Number.isFinite(distances[end])||distances[end]===0)return null
  const path=[end];while(path.at(-1)!==start){const p=previous[path.at(-1)];if(p<0)return null;path.push(p)}
  const coordinates=path.reverse().map(n=>graph.nodes[n]),meters=coordinates.slice(1).reduce((n,p,i)=>n+haversineMeters(...coordinates[i],...p),0)
  return {coordinates,minutes:distances[end],meters}
}
