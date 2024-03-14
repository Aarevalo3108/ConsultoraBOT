// funciones principales del bot
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')

// Dependencias para el bot, proveedor (baileys) y adaptador. Asi como una funcion para mostrar el codigo QR por una pagina web
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MySQLAdapter = require('@bot-whatsapp/database/mysql')
const {createPool} = require('mysql2/promise');

// Variables de entorno
require('dotenv').config()

/**
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

//  Expresiones regulares para validar cada entrada y evitar inyeccion SQL

const regex = {
  name: /^[a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,32}$/,
  ci: /^\d{8}$/,
  tlf: /^\d{11}$/,
  long_text: /^[a-zA-ZáéíóúÁÉÍÓÚ0-9.,\s]{20,255}$/,
  short_text: /^[a-zA-ZáéíóúÁÉÍÓÚ0-9.,\s]{1,45}$/,
  sex: /^[fFmM]$/,
  schedule: /^(?:[01]\d|2[0-3]):[0-5]\d$/,
  birth: /^(19\d\d|20[0-1]\d|202[0-4])-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/,
  sex: /^[fFmM]$/
}

// funcion para manejar datos provenientes de la base de datos
const manageData = async (sentence) => {
  try{
    const [result] = await pool.query(sentence);
    return result;
  }
  catch(err){
    console.error(err);
  }
}

const flowTerminarChat = addKeyword("7").addAnswer(`Gracias por usar el *ChatBOT* 👋👋`)



const flowAgendarCita = addKeyword("6").addAnswer(
  `Ingrese el número de cédula del paciente 🧐💉`,{capture: true},
  async(ctx,{state,fallBack,flowDynamic,endFlow}) => {
    console.log(ctx.from);
    if(!regex.ci.test(ctx.body)){
      return fallBack();
    }
    const sintomas = await manageData(`SELECT sintoma FROM paciente WHERE cedula=${ctx.body}`)
    if(!sintomas.length){
      return await flowDynamic('No se encuentra registrado ese numero de cedula')
    }
  }
)


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
const flowAgregarPaciente = addKeyword("1").addAnswer(
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
  `Ingrese los síntomas que presenta: `,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(!regex.long_text.test(ctx.body)){
      return fallBack();
    }
    else if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    await state.update({symptoms: ctx.body})
  }
).addAnswer(
  `Ingrese sexo del paciente: Ejm: M o F`,{capture: true},
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
      await flowDynamic(`Por favor, ingrese su información nuevamente. 🤗`)
      return gotoFlow(flowPrincipal)
    }
    else if(String(ctx.body).toLowerCase() == 's'){
      const nuevoPaciente = state.getMyState()
      await manageData(`INSERT INTO paciente (Diagnostico_id,nombre, apellido,nacimiento,cedula,telefono,sintoma,sexo) VALUES ('1','${nuevoPaciente.name}','${nuevoPaciente.last_name}','${nuevoPaciente.birth}','${nuevoPaciente.ci}','${nuevoPaciente.tlf}','${nuevoPaciente.symptoms}','${nuevoPaciente.sex}')`);
      return await flowDynamic(`Informacion ingresada con exito!. 😎`)
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
  *6*. Agendar cita ❌.
  *7*. Terminar chat. ✅`
  ,null,null,[flowMostrarPaciente,flowAgregarPaciente,flowAgregarDoctor,
              flowMostrarDoctor,flowMostrarClinica,flowAgendarCita,flowTerminarChat]
)

// Funcion principal para inicializar el bot
const main = async () => {
  const adapterDB = new MySQLAdapter(mysqlDB)
  const adapterFlow = createFlow([flowPrincipal])
  const adapterProvider = createProvider(BaileysProvider)
  createBot({
      flow: adapterFlow,
      provider: adapterProvider,
      database: adapterDB,
  })
  QRPortalWeb()
}

main()
