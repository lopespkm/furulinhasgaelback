const multer = require('multer');
const path = require('path');
const fs = require('fs');

class UploadMiddleware {
  constructor() {
    // Configuração de armazenamento
    this.storage = multer.diskStorage({
      destination: (req, file, cb) => {
        let uploadPath;
        
        // Determinar pasta baseado no tipo de upload
        if (req.route.path.includes('scratchcards')) {
          uploadPath = 'public/uploads/scratchcards';
        } else if (req.route.path.includes('prizes')) {
          uploadPath = 'public/uploads/prizes';
        } else {
          uploadPath = 'public/uploads';
        }
        
        // Criar pasta se não existir
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        // Gerar nome único para o arquivo
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        const filename = file.fieldname + '-' + uniqueSuffix + extension;
        cb(null, filename);
      }
    });
    
    // Filtro de tipos de arquivo
    this.fileFilter = (req, file, cb) => {
      // Log para debug
      console.log('🔍 Verificando arquivo:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });
      
      // Tipos de arquivo permitidos
      const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      
      if (mimetype && extname) {
        console.log('✅ Arquivo aceito:', file.originalname);
        return cb(null, true);
      } else {
        console.log('❌ Arquivo rejeitado:', file.originalname, 'Mimetype:', file.mimetype, 'Extensão:', path.extname(file.originalname));
        cb(new Error('Apenas arquivos de imagem são permitidos (JPEG, JPG, PNG, GIF, SVG, WEBP)'));
      }
    };
    
    // Configuração do multer
    this.upload = multer({
      storage: this.storage,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB máximo
        files: 20 // máximo 20 arquivos por vez
      },
      fileFilter: this.fileFilter
    });
    
    // Configuração específica para fields
    this.fieldsUpload = multer({
      storage: this.storage,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB máximo
        files: 20 // máximo 20 arquivos por vez
      },
      fileFilter: this.fileFilter
    });
  }
  
  /**
   * Middleware para upload de uma única imagem
   * @param {string} fieldName - Nome do campo do arquivo
   * @returns {Function} Middleware do multer
   */
  single(fieldName = 'image') {
    console.log('📁 Configurando upload single para campo:', fieldName);
    return this.upload.single(fieldName);
  }
  
  /**
   * Middleware para upload de múltiplas imagens
   * @param {string} fieldName - Nome do campo dos arquivos
   * @param {number} maxCount - Número máximo de arquivos
   * @returns {Function} Middleware do multer
   */
  array(fieldName = 'images', maxCount = 9) {
    console.log('📁 Configurando upload array para campo:', fieldName, 'maxCount:', maxCount);
    return this.upload.array(fieldName, maxCount);
  }
  
  /**
   * Middleware para upload de campos múltiplos
   * @param {Array} fields - Array de objetos com name e maxCount
   * @returns {Function} Middleware do multer
   */
  fields(fields) {
    console.log('📁 Configurando upload fields:', fields);
    return this.fieldsUpload.fields(fields);
  }
  
  /**
   * Middleware para upload de campos múltiplos com suporte a campos duplicados
   * @param {Array} fields - Array de objetos com name e maxCount
   * @returns {Function} Middleware do multer
   */
  fieldsWithDuplicates(fields) {
    console.log('📁 Configurando upload fields com suporte a duplicados:', fields);
    
    // Criar configuração que aceita campos duplicados
    const uploadConfig = multer({
      storage: this.storage,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB máximo
        files: 20 // máximo 20 arquivos por vez
      },
      fileFilter: this.fileFilter
    }).any(); // Usar .any() para aceitar qualquer campo
    
    return (req, res, next) => {
      uploadConfig(req, res, (err) => {
        if (err) {
          return next(err);
        }
        
        // Organizar arquivos por campo esperado
        if (req.files && req.files.length > 0) {
          req.files = req.files.reduce((acc, file) => {
            if (!acc[file.fieldname]) {
              acc[file.fieldname] = [];
            }
            acc[file.fieldname].push(file);
            return acc;
          }, {});
        }
        
        next();
      });
    };
  }
  
  /**
   * Middleware de tratamento de erros do multer
   * @param {Error} error - Erro do multer
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  handleError(error, req, res, next) {
    console.log('🚨 Erro no upload:', error);
    
    if (error instanceof multer.MulterError) {
      console.log('🚨 Erro Multer:', error.code, error.message);
      
      switch (error.code) {
        case 'LIMIT_FILE_SIZE':
          return res.status(400).json({
            success: false,
            message: 'Arquivo muito grande. Tamanho máximo: 10MB'
          });
        case 'LIMIT_FILE_COUNT':
          return res.status(400).json({
            success: false,
            message: 'Muitos arquivos. Máximo permitido: 20 arquivos'
          });
        case 'LIMIT_UNEXPECTED_FILE':
          console.log('🚨 Campo inesperado:', error.field);
          let expectedFields = [];
          try {
            expectedFields = this.getExpectedFields(req);
          } catch (e) {
            console.log('Erro ao obter campos esperados:', e);
            expectedFields = ['scratchcard_image', 'prize_images'];
          }
          return res.status(400).json({
            success: false,
            message: `Campo de arquivo inesperado: "${error.field}". Verifique se o nome do campo está correto.`,
            expected_fields: expectedFields,
            received_field: error.field,
            tip: 'Para múltiplos arquivos, use o campo "prize_images" (plural) e envie todos os arquivos com o mesmo nome de campo'
          });
        default:
          return res.status(400).json({
            success: false,
            message: `Erro no upload: ${error.message}`
          });
      }
    }
    
    if (error.message.includes('Apenas arquivos de imagem')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    next(error);
  }
  
  /**
   * Obter campos esperados baseado na rota
   * @param {Object} req - Request object
   * @returns {Array} Array com os campos esperados
   */
  getExpectedFields(req) {
    if (req.route.path.includes('/upload-image') || req.route.path.includes('/upload-prize-image')) {
      return ['image'];
    } else if (req.route.path.includes('/admin/create')) {
      return ['scratchcard_image', 'prize_images'];
    }
    return [];
  }
  
  /**
   * Deletar arquivo do sistema
   * @param {string} filePath - Caminho do arquivo
   * @returns {Promise<boolean>} Sucesso da operação
   */
  async deleteFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erro ao deletar arquivo:', error);
      return false;
    }
  }
  
  /**
   * Gerar URL pública para o arquivo
   * @param {string} filename - Nome do arquivo
   * @param {string} type - Tipo (scratchcards ou prizes)
   * @returns {string} URL pública
   */
  generatePublicUrl(filename, type = 'scratchcards') {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:7778';
    return `${baseUrl}/uploads/${type}/${filename}`;
  }
}

module.exports = new UploadMiddleware();