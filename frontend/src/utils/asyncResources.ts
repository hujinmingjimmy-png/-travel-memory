/** 限定单阶段等待时间；超时/父级取消都取消该阶段，并清理监听器。 */
export async function withResourceDeadline<T>(run:(signal:AbortSignal)=>Promise<T>,ms:number,parent?:AbortSignal):Promise<T>{
  const controller=new AbortController()
  if(parent?.aborted) throw new DOMException('Aborted','AbortError')
  const onAbort=()=>controller.abort(parent?.reason)
  parent?.addEventListener('abort',onAbort,{once:true})
  let timer:ReturnType<typeof setTimeout>|undefined
  let rejectAbort:()=>void=()=>{}
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(new DOMException('Aborted','AbortError'));controller.signal.addEventListener('abort',rejectAbort,{once:true})})
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new Error('资源读取超时，已停止本轮等待'));controller.abort()},ms)})
  try{return await Promise.race([run(controller.signal),timeout,aborted])}
  finally{clearTimeout(timer);parent?.removeEventListener('abort',onAbort);controller.signal.removeEventListener('abort',rejectAbort);controller.abort()}
}
