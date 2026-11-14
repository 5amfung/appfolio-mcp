import Ajv from 'ajv'
import addFormats from 'ajv-formats'

// Share the same formats between runtime validation and documentation examples.
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
