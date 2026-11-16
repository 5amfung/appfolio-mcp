import Ajv from 'ajv'
import addFormats from 'ajv-formats'

export const ajv = new Ajv({
  strict: false,
  allErrors: true,
  validateFormats: true,
})
addFormats(ajv)
ajv.addFormat('decimal', {
  type: 'string',
  validate: (v) => /^-?\d+(\.\d+)?$/.test(v),
})
ajv.addFormat('float', { type: 'number', validate: Number.isFinite })
ajv.addFormat('string', true)
