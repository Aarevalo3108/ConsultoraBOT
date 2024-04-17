// funciones principales del bot

const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
const AICall = require("./AICall/index.js")
require('./constantes/constantsBOT.js').pacientePrompt

// Dependencias para el bot, proveedor (baileys) y adaptador. Asi como una funcion para mostrar el codigo QR por una pagina web

const {createPool} = require('mysql2/promise');
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MySQLAdapter = require('@bot-whatsapp/database/mysql')

// Variables de entorno

require('dotenv').config()
const {regex, validator, doctorAI, pacientePrompt,dias_semana,asignator} = require('./constantes/constantsBOT')


// Funciones y declaraciones para la base de datos
// --------------------------------------------------------------------------------
// Organizacion del objeto mysqlDB
const mysqlDB = {
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.NAME,
  port: process.env.PORT
}

// creacion de la pool de consultas
const pool = createPool(mysqlDB);
// Funcion para manejar sentencias en la base de datos
const manageData = async (sentence) => {
  try{
    const [result] = await pool.query(sentence);
    return result;
  }
  catch(err){
    console.error(err);
  }
}

// Funcion que se asegura que cada paciente tenga su diagnostico y tratamiento
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

const manageHours = (hour,start,limit) => {
  let newHour = new Date(`1970-01-01T${hour}`);
  newHour.setHours(newHour.getHours() + 1);
  const newLimit = new Date(`1970-01-01T${limit}`);
  if(newHour.getHours() >= newLimit.getHours()){
    newHour = new Date(`1970-01-01T${start}`);
  }
  return newHour.toTimeString().split(' ')[0].substr(0, 5);
}

// --------------------------------------------------------------------------------


const flowCitaAgendada = addKeyword('2112jsjf.;').addAnswer('¿Es correcto? S o N:',{capture: true},
async (ctx,{fallBack,endFlow,flowDynamic,state,gotoFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    if(ctx.body.toLowerCase() === 'n'){
      await flowDynamic(`Gracias, por favor, ingrese su información nuevamente. 🤗`)
      return gotoFlow(flowAgendarCita)
    }
    else if(ctx.body.toLowerCase() === 's'){
      const estado = await state.getMyState()
      const localHour = new Date()
      await manageData(`INSERT INTO cita (paciente_id,doctor_id,dia,hora,factura_fecha) VALUES (${estado.paciente_id},${estado.doctores[estado.doctorEscogido].id},'${estado.doctores[estado.doctorEscogido].dia_trabajar}','${estado.doctores[estado.doctorEscogido].hora_trabajar}','${localHour.toString()}')`)
      return endFlow(`Cita agendada con exito. 🤗`)
    }
    else{
      return fallBack()
    }
  }
)

const flowAgendado = addKeyword('2112jsjf.;ld',{sensitive: true}).addAction(
  async (_,{flowDynamic,state,gotoFlow}) => {
    const estado = await state.getMyState()
    console.log(estado)
    await flowDynamic(`Su cita quedaria de esta forma: \n
    Doctor a cargo: ${estado.doctores[estado.doctorEscogido].nombre_completo}\n
    Paciente: ${estado.nombre_completo_paciente}\n
    Fecha y hora: ${estado.doctores[estado.doctorEscogido].hora_trabajar}, ${estado.doctores[estado.doctorEscogido].dia_trabajar}\n
    Clinica: ${estado.doctores[estado.doctorEscogido].clinica}\n`)
    return gotoFlow(flowCitaAgendada)
  }
)

const flowMostrarDatosCita = addKeyword('2112jsjf.',{sensitive: true}).addAnswer('Ingrese el nombre y apellido del doctor que desee:',{capture: true},
  async (ctx,{fallBack,endFlow,flowDynamic,state,gotoFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    const estado = await state.getMyState()
    let doctorEscogido = null;
    (estado.doctores).map((info,index) => {
      if(ctx.body.toLowerCase() === info.nombre_completo.toLowerCase()){
        doctorEscogido = index
      }
    })
    console.log(doctorEscogido)
    if(doctorEscogido == null){
      await flowDynamic(`El doctor que ha suministrado no existe. 🤗`)
      return fallBack()
    }
    await state.update({doctorEscogido: doctorEscogido})
    return gotoFlow(flowAgendado)
  }
)

const flowCita = addKeyword('!1n23jdhskj',{sensitive: true}).addAction(
  async (_,{flowDynamic,state,gotoFlow}) => {
    const datosPaciente = state.getMyState()
    const espID = await manageData(`SELECT id FROM especialidad WHERE descripcion = '${datosPaciente.especialidad}'`);
    const doctores = await manageData(`SELECT id,nombre,apellido,telefono,horario_id,clinica_id FROM doctor WHERE especialidad_id = ${espID[0].id}`);
    let message = ''; const ArrayDoctores = [];
    const promises = doctores.map(async (doctor) => {
      const clinica = await manageData(`SELECT nombre FROM clinica WHERE id = ${doctor.clinica_id}`)
      const horario = await manageData(`SELECT inicio,fin,dia_inicio,dia_fin FROM horario WHERE id = ${doctor.horario_id}`)
      const localHour = new Date()
      const Days = [(horario[0].dia_inicio).toLowerCase(),(horario[0].dia_fin).toLowerCase()]
      const Hours = [horario[0].inicio,horario[0].fin]
      const disponibilidad = await manageData(`SELECT dia,hora FROM cita WHERE doctor_id = ${doctor.id}`)
      let index
      if(disponibilidad.length != 0){
        const nuevaHoraCita = manageHours(disponibilidad[disponibilidad.length -1].hora,Hours[0],Hours[1])
        localHour.getDay() < dias_semana.indexOf(Days[0]) ?  index = 0 : index = 1;
        if(nuevaHoraCita == Hours[0] && dias_semana[dias_semana.indexOf(Days[index])] == Days[0]){
          message += `- *${doctor.nombre} ${doctor.apellido}* - ${doctor.telefono} - disponible para: ${Hours[0]} el dia: ${dias_semana[dias_semana.indexOf(Days[index])]}, en ${clinica[0].nombre}\n\n`
        }
        else{
          message += `- *${doctor.nombre} ${doctor.apellido}* - ${doctor.telefono} - disponible para: ${nuevaHoraCita} el dia: ${dias_semana[dias_semana.indexOf(Days[index])]}, en ${clinica[0].nombre}\n\n`
        }
        const Doctor = {
          nombre_completo: `${doctor.nombre} ${doctor.apellido}`,
          hora_trabajar: nuevaHoraCita,
          clinica: clinica[0].nombre,
          dia_trabajar: dias_semana[dias_semana.indexOf(Days[index])],
          id: doctor.id
        }
        ArrayDoctores.push(Doctor)
      }
      else{
        localHour.getDay() < dias_semana.indexOf(Days[0]) ?  index = 0 : index = 1;
        message += `- *${doctor.nombre} ${doctor.apellido}* - ${doctor.telefono} - disponible para: ${Hours[0]} el dia: ${dias_semana[dias_semana.indexOf(Days[index])]}, en ${clinica[0].nombre}\n\n`
        const Doctor = {
          nombre_completo: `${doctor.nombre} ${doctor.apellido}`,
          hora_trabajar: Hours[0],
          clinica: clinica[0].nombre,
          dia_trabajar: dias_semana[dias_semana.indexOf(Days[index])],
          id: doctor.id
        }
        ArrayDoctores.push(Doctor)
      }
    })
    Promise.all(promises)
    .then(async () => {
      await state.update({doctores: ArrayDoctores})
      await flowDynamic(`Los doctores disponibles son: \n\n${message}`)
      return gotoFlow(flowMostrarDatosCita)
    })
    .catch((err) => {
      console.log(err)
    })
  }
)

// Flujo para probar IA
const flowTest = addKeyword(['test','Test'],{sensitive: true}).addAnswer(`Ingrese los síntomas que presenta:`,{capture: true},
  async (ctx,{fallBack,endFlow,flowDynamic}) => {
    if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.long_text.test(ctx.body)){
      await flowDynamic(`Los síntomas que ha suministrado no son válidos (sea detallado, con un texto no tan largo ni tan corto, no se admiten caracteres especiales, solo *.* *,* y números). Por favor, ingrese de nuevo. 🤗`)
      return fallBack();
    }
    await flowDynamic(`Validando sintomas...`)
    const validacion = await AICall(validator,ctx.body)
    if(validacion.trim() == "NO_VALIDO"){
      await flowDynamic(`Los sintomas que ha suministrado no son válidos. Por favor, ingrese de nuevo. 🤗`)
      return fallBack()
    }
    await flowDynamic(`Síntomas validados! generando diagnóstico...🤖`)
    const sentencia = await AICall(doctorAI,ctx.body)
    const diagnostico = sentencia.split('DIAGNOSTICO: ')[1].split('TRATAMIENTO: ')[0];
    const tratamiento = sentencia.split('TRATAMIENTO: ')[1];
    return await flowDynamic(
    `- Los síntomas del paciente son 🤧: ${ctx.body}
    \n- Un posible diagnóstico 🤔: ${diagnostico}
    \n- Un posible tratamiento 💊: ${tratamiento}`)
  }
)

// Flujo terminar chat
const flowTerminarChat = addKeyword("7",{sensitive: true}).addAnswer(`Gracias por usar el *ChatBOT* 👋👋`);

// Flujo agendar cita
const flowAgendarCita = addKeyword("6",{sensitive: true}).addAnswer(`Ingrese el número de cédula del paciente 🧐💉`,{capture: true},
  async(ctx,{state,fallBack,flowDynamic,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(String(ctx.body).length == 7){
      ctx.body = `0${String(ctx.body)}`;
    }
    if(!regex.ci.test(ctx.body)){
      return fallBack();
    }
    const datos = await manageData(`SELECT sintoma,diagnostico_id,id,nombre,apellido FROM paciente WHERE cedula=${ctx.body}`)
    const pacienteTieneCita = await manageData(`SELECT dia,hora FROM cita WHERE paciente_id=${datos[0].id}`)
    if(pacienteTieneCita.length){
      await flowDynamic(`El paciente ya tiene una cita agendada el dia ${pacienteTieneCita[0].dia} a las ${pacienteTieneCita[0].hora}. Por favor, ingrese de nuevo. 🤗`)
    }
    if(!datos.length){
      await flowDynamic('No se encuentra registrado ese numero de cédula')
      return fallBack();
    }
    await state.update({diagnostico_id: datos[0].diagnostico_id, sintoma: datos[0].sintoma, paciente_id: datos[0].id,nombre_completo_paciente: `${datos[0].nombre} ${datos[0].apellido}`})
  }
).addAnswer(`¿Deseas agendar una cita? S o N`,{capture: true},
  async(ctx,{state,flowDynamic,gotoFlow,fallBack}) => {
    if(String(ctx.body).toLowerCase() == 'n'){
      await flowDynamic(`Gracias, por favor, ingrese su información nuevamente. 🤗`)
      return gotoFlow(flowPrincipal)
    }else if(String(ctx.body).toLowerCase() != 's'){
      return fallBack();
    }
    await flowDynamic(`Espere un momento mientras buscamos la mejor especialidad para usted... ⌚`)
    const info = state.getMyState();
    const posibilidades = await AICall(asignator,`Sintomas: ${info.sintoma}.`);
    const asignado = posibilidades.trim().split('-');
    if((await manageData(`SELECT descripcion FROM especialidad WHERE disponibilidad=1 AND descripcion="${asignado[0]}"`)).length != 0){
      await flowDynamic(`La mejor especialidad para usted es: ${asignado[0]}`)
      await state.update({especialidad: asignado[0]})
    }
    else if((await manageData(`SELECT descripcion FROM especialidad WHERE disponibilidad=1 AND descripcion="${asignado[1]}"`)).length != 0){
      await flowDynamic(`La mejor especialidad para usted es: ${asignado[1]}`)
      await state.update({especialidad: asignado[1]})
    }
    else if((await manageData(`SELECT descripcion FROM especialidad WHERE disponibilidad=1 AND descripcion="${asignado[2]}"`)).length != 0){
      await flowDynamic(`La mejor especialidad para usted es: ${asignado[2]}`)
      await state.update({especialidad: asignado[2]})
    }
    else{
      return await flowDynamic(`Lo sentimos, no hay especialidades disponibles para usted. 😢`)
    }
    return gotoFlow(flowCita)
  }
)


// Flujo para mostrar clinicas
const flowMostrarClinica = addKeyword("5",{sensitive: true}).addAnswer(`Aquí tienes a todas las clinicas actualmente:`,null,
  async (_,{flowDynamic}) => {
    const data = await manageData("SELECT nombre,ubicacion,telefono FROM clinica");
    let message = ""; let i=1;
    data.map((info) =>{
      message += `${i}. ${info.nombre}. (${info.ubicacion}). ${info.telefono}\n`;
      i++;
    })
    return await flowDynamic([{body: message}]);
  }
)

// Flujo para mostrar doctores
const flowMostrarDoctor = addKeyword("4",{sensitive: true}).addAnswer(`Aquí tienes a todos los doctores actualmente:`,null,
  async (_,{flowDynamic}) => {
    const data = await manageData("SELECT nombre,apellido,telefono,especialidad_id FROM doctor");
    const esp = await manageData("SELECT descripcion FROM especialidad");
    let message = ""; let i=1;
    data.map((info) =>{
      message += `${i}. ${info.nombre} ${info.apellido} ${info.telefono} (${esp[info.especialidad_id-1].descripcion}).\n`;
      i++;
    })
    return await flowDynamic([{body: message}]);
  }
)


// Flujo para agregar doctor
const flowAgregarDoctor = addKeyword("2",{sensitive: true}).addAnswer(
  `- (escribe *terminar* cuando quieras para cancelar la conversación)\n\nIngrese el primer nombre del doctor:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.name.test(ctx.body)){
      return fallBack()
    }
    await state.update({name: ctx.body})
  }
).addAnswer(`Ingrese el primer apellido del doctor:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.name.test(ctx.body)){
      return fallBack();
    }
    await state.update({last_name: ctx.body})
  }
).addAnswer(`Ingrese número de teléfono:\n Ejm: 04161816987.`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.tlf.test(ctx.body)){
      return fallBack();
    }
    return await state.update({tlf: ctx.body})
  }
).addAction(
  async (_,{flowDynamic}) => {
    const especialidades = await manageData("SELECT descripcion FROM especialidad");
    const mapeo = especialidades.map((especialidad) => especialidad.descripcion).join('\n- ');
    await flowDynamic(`Escoja su especialidad:\n- ${mapeo}`);
  }
).addAnswer(`Ingrese su especialidad de entre las que hay disponibles:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    const espc = await manageData(`SELECT id FROM especialidad WHERE descripcion = '${ctx.body}'`)
    if(!espc.length){
      return fallBack();
    }
    return await state.update({spec: espc[0].id})
  }
).addAnswer(`Ingrese su horario de atención (inicio y fin). Ejemplo: 08:00 18:00`,{capture: true},
async (ctx,{fallBack,state,endFlow}) => {
  const hora_inicio = ctx.body.split(' ')[0];
  const hora_fin = ctx.body.split(' ')[1];
  if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
    return endFlow('❎Conversación terminada❎')
  }
  if(!regex.hour.test(hora_inicio) || !regex.hour.test(hora_fin)){
    return fallBack();
  }
  return await state.update({hour1: hora_inicio,hour2: hora_fin})
}
).addAnswer(`Ingrese sus dias de atención (escoja solo 2). Ejemplo: lunes viernes`,{capture: true},
async (ctx,{fallBack,state,endFlow}) => {
  const dia1 = ctx.body.split(' ')[0];
  const dia2 = ctx.body.split(' ')[1];
  if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
    return endFlow('❎Conversación terminada❎')
  }
  if(dias_semana.includes(dia1.toLowerCase()) === false || dias_semana.includes(dia2.toLowerCase()) === false && dia1.toLowerCase() != dia2.toLowerCase()){
    return fallBack();
  }
  const hours = state.getMyState();
  const check = await manageData(`SELECT id FROM horario WHERE inicio='${hours.hour1}' AND fin='${hours.hour2}' AND dia_inicio='${dia1}' AND dia_fin='${dia2}'`);
  let idn = 0;
  if(check.length == 0){
    await manageData(`INSERT INTO horario (inicio,fin,dia_inicio,dia_fin) VALUES ('${hours.hour1}','${hours.hour2}','${dia1}','${dia2}')`);
    idn = await manageData(`SELECT id FROM horario WHERE inicio='${hours.hour1}' AND fin='${hours.hour2}' AND dia_inicio='${dia1}' AND dia_fin='${dia2}'`);
    return await state.update({day1: dia1,day2: dia2,idHorario: idn[0].id})
  }else{
    idn = check[0].id
    return await state.update({day1: dia1,day2: dia2,idHorario: idn})
  }
}
).addAction(
  async (_,{flowDynamic,state}) => {
    const nuevoDoctor = state.getMyState()
    await flowDynamic(`La información suministrada es la siguiente:\n
      Nombre: ${nuevoDoctor.name}\n
      Apellido: ${nuevoDoctor.last_name}\n
      Teléfono: ${nuevoDoctor.tlf}\n
      Especialidad: ${nuevoDoctor.spec}\n
      Horario: ${nuevoDoctor.hour1} - ${nuevoDoctor.hour2}\n
      Dias de atención: ${nuevoDoctor.day1} y ${nuevoDoctor.day2}\n`
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
      await manageData(`INSERT INTO doctor (nombre,apellido,clinica_id,horario_id,especialidad_id,telefono) VALUES ('${nuevoDoctor.name}','${nuevoDoctor.last_name}','1','${nuevoDoctor.idHorario}','${nuevoDoctor.spec}','${nuevoDoctor.tlf}')`)
      return await flowDynamic(`¡Información ingresada con éxito!. 😎`)
    }
    else{
      return fallBack()
    }
  }
)

// Flujo para mostrar paciente
const flowMostrarPaciente = addKeyword("3",{sensitive: true}).addAnswer(`Aquí tienes a todos los pacientes actualmente:`,null,
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

// Flujo para agregar paciente
const flowAgregarPaciente = addKeyword("1",{sensitive: true}).addAnswer(
`- (escribe *terminar* cuando quieras para cancelar la conversación)\n\nIngrese el primer nombre del paciente:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar'){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.name.test(ctx.body)){
      return fallBack()
    }
    return await state.update({name: ctx.body})
  }
).addAnswer(`Ingrese el primer apellido del paciente:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.name.test(ctx.body)){
      return fallBack();
    }
    await state.update({last_name: ctx.body})
  }
).addAnswer(`Ingrese fecha de nacimiento:\n Ejm: 2001-08-31`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.birth.test(ctx.body)){
      return fallBack();
    }
    await state.update({birth: ctx.body})
  }
).addAnswer(`Ingrese número de cédula:`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(String(ctx.body).length == 7){
      ctx.body = `0${String(ctx.body)}`;
    }
    if(!regex.ci.test(ctx.body)){
      return fallBack();
    }
    await state.update({ci: ctx.body})
  }
).addAnswer(`Ingrese número de teléfono:\n Ejm: 04161816987.`,{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.tlf.test(ctx.body)){
      return fallBack();
    }
    await state.update({tlf: ctx.body})
  }
).addAnswer(`Ingrese los síntomas que presenta: (no se admiten caracteres especiales que no sean puntos y comas, espere a la validacion!)`,{capture: true},
  async (ctx,{fallBack,state,endFlow,flowDynamic}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.long_text.test(ctx.body)){
      await flowDynamic(`Los síntomas que ha suministrado no son válidos (sea detallado, con un texto no tan largo ni tan corto, no se admiten caracteres especiales, solo *.* *,* y números). Por favor, ingrese de nuevo. 🤗`)
      return fallBack();
    }
    const validacion = await AICall(validator,ctx.body)
    if(validacion.trim() == "NO_VALIDO"){
      await flowDynamic(`Los síntomas que ha suministrado no son válidos. Por favor, ingrese de nuevo. 🤗`)
      return fallBack()
    }
    await state.update({symptoms: ctx.body})
  }
).addAnswer([`Sintomas validados!`,`Ingrese sexo del paciente: Ejm: M o F`],{capture: true},
  async (ctx,{fallBack,state,endFlow}) => {
    if(ctx.body.toLowerCase() === 'terminar' || ctx.body == 7){
      return endFlow('❎Conversación terminada❎')
    }
    if(!regex.sex.test(ctx.body)){
      return fallBack();
    }
    await state.update({sex: ctx.body})
  }
).addAction(
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
      const sentencia = await AICall(doctorAI,pacientePrompt(nuevoPaciente))
      const diagnostico = sentencia.split('DIAGNOSTICO: ')[1].split('TRATAMIENTO: ')[0];
      const tratamiento = sentencia.split('TRATAMIENTO: ')[1];
      await manageData(`INSERT INTO diagnostico (descripcion,tratamiento) VALUES ('${diagnostico}','${tratamiento}');`)
      const index = await manageData(`SELECT id FROM diagnostico WHERE descripcion ='${diagnostico}' AND tratamiento ='${tratamiento}'`)
      await manageData(`INSERT INTO paciente (Diagnostico_id,nombre, apellido,nacimiento,cedula,telefono,sintoma,sexo) VALUES ('${index[0].id}','${nuevoPaciente.name}','${nuevoPaciente.last_name}','${nuevoPaciente.birth}','${nuevoPaciente.ci}','${nuevoPaciente.tlf}','${nuevoPaciente.symptoms}','${nuevoPaciente.sex}')`);
      console.log(`Paciente ${nuevoPaciente.cedula} actualizado con el diagnostico: ${index[0].id}`);
      await flowDynamic(`¡Información ingresada con éxito! 🤖`)
      await flowDynamic(
        `- Los síntomas del paciente son 🤧: ${nuevoPaciente.symptoms}
        \n- Un posible diagnóstico 🤔: ${diagnostico}
        \n- Un posible tratamiento 💊: ${tratamiento}`)
      return gotoFlow(flowConfirmarCita)
    }
    else{
      return fallBack()
    }
  }
)

// Flujo onfirmar cita
const flowConfirmarCita = addKeyword('...cita...').addAnswer(`Si desea agendar una cita, ingrese *6*. Si desea terminar el chat, ingrese *7*.`,{capture: true},
  async(ctx,{fallBack}) => {
    if(ctx.body !== '6' && ctx.body !== '7'){
      return fallBack();
    }
  },[flowAgendarCita,flowTerminarChat]
)


// Flujo base principal, sin esta, no se ejecuta ningun otro flow o funcion secundaria.
const flowPrincipal = addKeyword(EVENTS.WELCOME).addAnswer(
  `🙌 ¡Hola! bienvenido a este *ChatBOT* de tu consultora *El Cielo te Espera* 👋👼. ¿Qué deseas hacer?:\n
  *1*. Agregar paciente. ✅
  *2*. Agregar doctor. ✅
  *3*. Mostrar pacientes. ✅
  *4*. Mostrar doctores. ✅
  *5*. Mostrar clínicas. ✅
  *6*. Agendar cita. ✅
  *test*. Probar IA.
  *7* o *terminar*. Terminar chat (en cualquier momento lo puedes hacer). ✅`
  ,null,null,[flowMostrarPaciente,flowAgregarPaciente,flowAgregarDoctor,
              flowMostrarDoctor,flowMostrarClinica,flowAgendarCita,flowTerminarChat,flowTest]
)

// Funcion principal para inicializar el bot
const main = async () => {
  const adapterDB = new MySQLAdapter(mysqlDB)
  const adapterFlow = createFlow([flowPrincipal,flowAgregarPaciente,flowTest,flowTerminarChat,flowConfirmarCita,flowCita,flowMostrarDatosCita,flowCitaAgendada,flowAgendado])
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