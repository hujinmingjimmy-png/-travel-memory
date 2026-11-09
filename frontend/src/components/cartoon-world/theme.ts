import type { CartoonMapStyle } from '@/api/travelMapScene'

export interface WorldPalette {
  skyTop: string
  skyBottom: string
  fog: string
  ground: string
  groundSide: string
  groundAccent: string
  water: string
  waterDeep: string
  road: string
  roadEdge: string
  route: string
  routeGlow: string
  treeLight: string
  treeDark: string
  trunk: string
  buildingA: string
  buildingB: string
  buildingC: string
  roofA: string
  roofB: string
  mountain: string
  mountainLight: string
  facadeTrim: string
  glass: string
  flower: string
  rock: string
  plaza: string
  light: string
  ambient: string
  card: string
  text: string
}

const palettes: Record<CartoonMapStyle, WorldPalette> = {
  SAKURA: {
    skyTop: '#bce9ef', skyBottom: '#ffe6ef', fog: '#f8dfe7',
    ground: '#dfe8bd', groundSide: '#a7bd82', groundAccent: '#f7ddb0',
    water: '#80d9d0', waterDeep: '#4fb9b6', road: '#fff3dc', roadEdge: '#d9bf9a',
    route: '#ff6f9f', routeGlow: '#ffd0df', treeLight: '#a9dc9a', treeDark: '#5ca378', trunk: '#9d7652',
    buildingA: '#f7d8cc', buildingB: '#c9dded', buildingC: '#ffe7ad', roofA: '#ce7181', roofB: '#6f92b5',
    mountain: '#9fb48f', mountainLight: '#d8e1b8', facadeTrim: '#fff8ef', glass: '#80b8c9', flower: '#f27eab', rock: '#c8bba6', plaza: '#f2d9b8', light: '#fff2df', ambient: '#d9eff4',
    card: 'rgba(255,251,252,.92)', text: '#74435d'
  },
  FRESH: {
    skyTop: '#a9dfe7', skyBottom: '#e8f8ee', fog: '#d7f0e7',
    ground: '#b9d9a9', groundSide: '#789e6e', groundAccent: '#e3e6af',
    water: '#6ac9cf', waterDeep: '#3fa4b4', road: '#f6f2dd', roadEdge: '#c6bda0',
    route: '#ee7aa2', routeGlow: '#ffe0ea', treeLight: '#91d28b', treeDark: '#3f9369', trunk: '#8b6b4f',
    buildingA: '#f5ddd2', buildingB: '#c6dfe8', buildingC: '#f6e7a9', roofA: '#d06d7d', roofB: '#5885a6',
    mountain: '#779c75', mountainLight: '#bdcf9b', facadeTrim: '#f7fff6', glass: '#70b2be', flower: '#f18aa9', rock: '#aab09a', plaza: '#e5d7b4', light: '#fff7df', ambient: '#cce8e9',
    card: 'rgba(250,255,253,.92)', text: '#376a5d'
  },
  PAPER: {
    skyTop: '#d9d2c3', skyBottom: '#f3e5cf', fog: '#dfd3bf',
    ground: '#d8c99d', groundSide: '#9d8a63', groundAccent: '#cbb47d',
    water: '#8ab6b6', waterDeep: '#668f95', road: '#f5e6c7', roadEdge: '#b99d72',
    route: '#c77763', routeGlow: '#f1c4a9', treeLight: '#9eaf72', treeDark: '#64734f', trunk: '#876548',
    buildingA: '#e7c6a5', buildingB: '#b8c7c2', buildingC: '#e6d497', roofA: '#9e5d4f', roofB: '#647b83',
    mountain: '#978e6a', mountainLight: '#c8bc8f', facadeTrim: '#f2e1c6', glass: '#7f9ba0', flower: '#bd705f', rock: '#9f9278', plaza: '#c8ad7f', light: '#f7e7ca', ambient: '#d6d0be',
    card: 'rgba(250,242,226,.94)', text: '#71563f'
  },
  NIGHT: {
    skyTop: '#172542', skyBottom: '#4c5378', fog: '#3b4669',
    ground: '#365f59', groundSide: '#203e3d', groundAccent: '#736f67',
    water: '#3a7789', waterDeep: '#244e63', road: '#756f78', roadEdge: '#4f4b55',
    route: '#ff8cb5', routeGlow: '#ffdae8', treeLight: '#4d8d72', treeDark: '#244f48', trunk: '#5e4a42',
    buildingA: '#6d7287', buildingB: '#657f96', buildingC: '#8d7d6d', roofA: '#a95f75', roofB: '#4f6d8f',
    mountain: '#455d61', mountainLight: '#6f7f76', facadeTrim: '#d6d7df', glass: '#85c2df', flower: '#ff80ad', rock: '#59646d', plaza: '#66626d', light: '#f3d9b0', ambient: '#62728f',
    card: 'rgba(28,35,57,.93)', text: '#ffe2ec'
  }
}

export function getWorldPalette(style: CartoonMapStyle): WorldPalette {
  return palettes[style] || palettes.SAKURA
}
