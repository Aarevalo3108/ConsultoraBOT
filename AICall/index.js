const OpenAI = require("openai");

const openai = new OpenAI({baseURL: "http://localhost:1234/v1", apiKey: "not_needed"});

async function AICall(pre_propmt,user_call) {
  try{
    const completion = await openai.chat.completions.create({
      messages:
      [{ role: "system",content: pre_propmt },
      {role: "user",content: user_call}],
      temperature: 0.7,
    });
    return completion.choices[0].message.content;
  }
  catch(error){
    console.log(error)
    return undefined;
  }

}

module.exports = AICall;