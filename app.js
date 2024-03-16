// funciones principales del bot
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const AICall = require("AICall")
// Dependencias para el bot, proveedor (baileys) y adaptador. Asi como una funcion para mostrar el codigo QR por una pagina web
const {createPool} = require('mysql2/promise');
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MySQLAdapter = require('@bot-whatsapp/database/mysql')
// Variables de entorno
require('dotenv').config()
const {regex, validator, doctorAI} = require('./constantes/constantsBOT')

/**s
 * Declaramos las conexiones de MySQL
 */
const mysqlDB = {
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.NAME,
  port: process.env.PORT
}
const pool = createPool(mysqlDB);
const manageData = async (sentence) => {
  try{
    const [result] = await pool.query(sentence);
    return result;
  }
  catch(err){
    console.error(err);
  }
}

const DBValidator = async () => {
  console.log("Comprobando base de datos...");
  const pacientes = await manageData("SELECT diagnostico_id,sintoma,cedula FROM paciente");
  let validacion = ''; let sentencia = '';let diagnostico='';let tratamiento='';let index = {}; let validando = false;
  pacientes.map((info) => {
    if(info.diagnostico_id == 1){
      validando = true
      return 0
    }
  })
  pacientes.map(async (info) => {
    if(info.diagnostico_id == 1){
      validacion = await AICall(validator,info.sintoma)
      if(validacion.trim() == "VALIDO"){
        sentencia = await AICall(doctorAI,info.sintoma)
        diagnostico = sentencia.split('DIAGNOSTICO: ')[1].split('TRATAMIENTO: ')[0];
        tratamiento = sentencia.split('TRATAMIENTO: ')[1];
        await manageData(`INSERT INTO diagnostico (descripcion,tratamiento) VALUES ('${diagnostico}','${tratamiento}');`)
        index = await manageData(`SELECT id FROM diagnostico WHERE descripcion ='${diagnostico}' AND tratamiento ='${tratamiento}'`)
        await manageData(`UPDATE paciente SET diagnostico_id = ${index[0].id} WHERE cedula = ${info.cedula}`)
        console.log(`Paciente ${info.cedula} actualizado con el diagnostico: ${index[0].id}`);
      }
    }
  })
  if(validando){
    console.log("Se esta validando la base de datos...");
  }else{
    console.log("Base de datos validada, no se modificaron datos.");
  }
}

const flowTerminarChat = addKeyword("7").addAnswer(`Gracias por usar el *ChatBOT* 👋👋`)



const flowAgendarCita = addKeyword("6").addAnswer(
  `Ingrese el número de cédula del paciente 🧐💉`,{capture: true},
  async(ctx,{state,fallBack,flowDynamic,endFlow}) => {
    if(String(ctx.body).length == 7){
      ctx.body = `0${String(ctx.body)}`;
    }
    if(!regex.ci.test(ctx.body)){
      return fallBack();
    }
    const sintomas = await manageData(`SELECT sintoma,diagnostico_id FROM paciente WHERE cedula=${ctx.body}`)
    const diagnostico = await manageData(`SELECT descripcion,tratamiento FROM diagnostico WHERE id=${sintomas[0].diagnostico_id}`)
    if(!sintomas.length){
      return await flowDynamic('No se encuentra registrado ese numero de cedula')
    }
    await flowDynamic(`- Sintomas del paciente son 🤧: ${sintomas[0].sintoma}
    \n- Un posible diagnostico 🤔: ${diagnostico[0].descripcion}
    \n- Un posible tratamiento 💊: ${diagnostico[0].tratamiento}`)
  }
).addAnswer(`¿Deseas agendar una cita? S o N`)


// Funcion para mostrar clinicas
const flowMostrarClinica = addKeyword("5").addAnswer(
  `Aquí tienes a todas las clinicas actualmente:`,null,
  async (_,{flowDynamic}) => {
    const data = await manageData("SELECT nombre,ubicacion FROM clinica");
    let message = ""; let i=1;
    data.map((info) =>{
      message += `${i}. ${info.nombre}. (${info.ubicacion}).\n`;
      i++;
    })
    return await flowDynamic([{body: message}]);
  }
)

// Funcion para mostrar doctores
const flowMostrarDoctor = addKeyword("4").addAnswer(
  `Aquí tienes a todos los doctores actualmente:`,null,
  async (_,{flowDynamic}) => {
    const data = await manageData("SELECT nombre,apellido,telefono FROM doctor");
    let message = ""; let i=1;
    data.map((info) =>{
      message += `${i}. ${info.nombre} ${info.apellido} ${info.telefono}.\n`;
      i++;
    })
    return await flowDynamic([{body: message}]);
  }
)

// Funcion para agregar doctor

const flowAgregarDoctor = addKeyword("2").addAnswer(
  `- (escribe *terminar* cuando quieras para cancelar la conversación)\n\nIngrese el primer nombre del doctor:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.name.test(ctx.body)){
      return fallBack()
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({name: ctx.body})
  }
).addAnswer(
  `Ingrese el primer apellido del doctor:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.name.test(ctx.body)){
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({last_name: ctx.body})
  }
).addAnswer(
  `Ingrese número de teléfono:\n Ejm: 04161816987.`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.tlf.test(ctx.body)){
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({tlf: ctx.body})
  }
).addAction(
  async (_,{flowDynamic,state}) => {
    const nuevoDoctor = state.getMyState()
    await flowDynamic(`La información suministrada es la siguiente:\n
      Nombre: ${nuevoDoctor.name}\n
      Apellido: ${nuevoDoctor.last_name}\n
      Teléfono: ${nuevoDoctor.tlf}\n`
      )
  }
).addAnswer(`Es correcto? S o N:`,{capture: true},
  async (ctx,{fallBack,state,flowDynamic,gotoFlow}) => {
    if(String(ctx.body).toLowerCase() === 'n'){
      await flowDynamic(`Por favor, ingrese su información nuevamente. 🤗`)
      return gotoFlow(flowPrincipal)
    }
    else if(String(ctx.body).toLowerCase() === 's'){
      const nuevoDoctor = state.getMyState()
      await manageData(`INSERT INTO doctor (nombre,apellido,clinica_id,horario_id,especialidad_id,telefono) VALUES ('${nuevoDoctor.name}','${nuevoDoctor.last_name}','1','1','1','${nuevoDoctor.tlf}')`)
      return await flowDynamic(`¡Información ingresada con éxito!. 😎`)
    }
    else{
      return fallBack()
    }
  }
)

// Funcion para mostrar paciento
const flowMostrarPaciente = addKeyword("3").addAnswer(
  `Aquí tienes a todos los pacientes actualmente:`,null,
  async (_,{flowDynamic}) => {
    const data = await manageData("SELECT nombre,apellido,cedula FROM paciente");
    let message = ""; let i=1;
    data.map((info) =>{
      message += `${i}. ${info.nombre} ${info.apellido} ${info.cedula}.\n`;
      i++;
    })
    return await flowDynamic([{body: message}]);
  }
)

// Funcion para agregar paciente
const flowAgregarPaciente = addKeyword("1",{sensitive: true}).addAnswer(
  `- (escribe *terminar* cuando quieras para cancelar la conversación)\n\nIngrese el primer nombre del paciente:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.name.test(ctx.body)){
      return fallBack()
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({name: ctx.body})
  }
).addAnswer(
  `Ingrese el primer apellido del paciente:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.name.test(ctx.body)){
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({last_name: ctx.body})
  }
).addAnswer(
  `Ingrese fecha de nacimiento:\n Ejm: 2001-08-31`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.birth.test(ctx.body)){
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({birth: ctx.body})
  }
).addAnswer(
  `Ingrese número de cédula:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(String(ctx.body).length == 7){
      ctx.body = `0${String(ctx.body)}`;
    }
    if(!regex.ci.test(ctx.body)){
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({ci: ctx.body})
  }
).addAnswer(
  `Ingrese número de teléfono:\n Ejm: 04161816987.`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.tlf.test(ctx.body)){
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({tlf: ctx.body})
  }
).addAnswer(
  `Ingrese los síntomas que presenta: (no se admiten caracteres especiales, espere un poco luego de ingresar los sintomas)`,{capture: true},
  async (ctx,{fallBack,state,endFlow,flowDynamic}) => {
    if(!regex.long_text.test(ctx.body)){
      await flowDynamic(`Los síntomas que ha suministrado no son válidos (sea detallado, con un texto no tan largo ni tan corto, no se admiten caracteres especiales, solo *.*, *,* y números). Por favor, ingrese de nuevo. 🤗`)
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    const validacion = await AICall(validator,ctx.body)
    if(validacion.trim() == "NO_VALIDO"){
      await flowDynamic(`Los sintomas que ha suministrado no son validos. Por favor, ingrese de nuevo. 🤗`)
      return fallBack()
    }
    await state.update({symptoms: ctx.body})
  }
).addAnswer(
  [`Sintomas validados!`,`Ingrese sexo del paciente: Ejm: M o F`],{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.sex.test(ctx.body)){
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({sex: ctx.body})
  }
)
.addAction(
  async (_,{flowDynamic,state}) => {
    const nuevoPaciente = state.getMyState()
    await flowDynamic(`La informacion suministrada es la siguiente:\n
      Nombre: ${nuevoPaciente.name}\n
      Apellido: ${nuevoPaciente.last_name}\n
      Nacimiento: ${nuevoPaciente.birth}\n
      Cédula: ${nuevoPaciente.ci}\n
      Teléfono: ${nuevoPaciente.tlf}\n
      Síntomas: ${nuevoPaciente.symptoms}\n
      Sexo: ${nuevoPaciente.sex}\n`
    )
  }
).addAnswer(`Es correcto? S o N:`,{capture: true},
  async (ctx,{fallBack,state,flowDynamic,gotoFlow}) => {
    if(String(ctx.body).toLowerCase() == 'n'){
      await flowDynamic(`Gracias, por favor, ingrese su información nuevamente. 🤗`)
      return gotoFlow(flowPrincipal)
    }
    else if(String(ctx.body).toLowerCase() == 's'){
      await flowDynamic(`Espere un momento... ⌚`)
      const nuevoPaciente = state.getMyState()
      const sentencia = await AICall(doctorAI,nuevoPaciente.symptoms)
      const diagnostico = sentencia.split('DIAGNOSTICO: ')[1].split('TRATAMIENTO: ')[0];
      const tratamiento = sentencia.split('TRATAMIENTO: ')[1];
      await manageData(`INSERT INTO diagnostico (descripcion,tratamiento) VALUES ('${diagnostico}','${tratamiento}');`)
      const index = await manageData(`SELECT id FROM diagnostico WHERE descripcion ='${diagnostico}' AND tratamiento ='${tratamiento}'`)
      await manageData(`INSERT INTO paciente (Diagnostico_id,nombre, apellido,nacimiento,cedula,telefono,sintoma,sexo) VALUES ('${index[0].id}','${nuevoPaciente.name}','${nuevoPaciente.last_name}','${nuevoPaciente.birth}','${nuevoPaciente.ci}','${nuevoPaciente.tlf}','${nuevoPaciente.symptoms}','${nuevoPaciente.sex}')`);
      console.log(`Paciente ${nuevoPaciente.cedula} actualizado con el diagnostico: ${index[0].id}`);
      return await flowDynamic(`Informacion ingresada con exito!, pruebe a agendar una cita. 🤖`)
    }
    else{
      return fallBack()
    }
  }
)


// Funcion base principal, sin esta, no se ejecuta ningun otro flow o funcion secundaria.
const flowPrincipal = addKeyword(EVENTS.WELCOME).addAnswer(
  `🙌 ¡Hola! bienvenido a este *ChatBOT* de tu consultora *El Cielo te Espera* 👋👼. ¿Qué deseas hacer?:\n
  *1*. Agregar paciente. ✅
  *2*. Agregar doctor. ✅
  *3*. Mostrar pacientes. ✅
  *4*. Mostrar doctores. ✅
  *5*. Mostrar clínicas. ✅
  *6*. Agendar cita (en desarrollo).
  *7*. Terminar chat. ✅`
  ,null,null,[flowMostrarPaciente,flowAgregarPaciente,flowAgregarDoctor,
              flowMostrarDoctor,flowMostrarClinica,flowAgendarCita,flowTerminarChat]
)

// Funcion principal para inicializar el bot
const main = async () => {
  const adapterDB = new MySQLAdapter(mysqlDB)
  const adapterFlow = createFlow([flowPrincipal,flowAgregarPaciente])
  const adapterProvider = createProvider(BaileysProvider)
  createBot({
      flow: adapterFlow,
      provider: adapterProvider,
      database: adapterDB,
  })
  QRPortalWeb()
}
DBValidator()
main()
