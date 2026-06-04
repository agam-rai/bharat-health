const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Registry to keep track of created models
const modelRegistry = {};

class MockDocument {
  constructor(data, model) {
    Object.assign(this, data);
    
    // Ensure we have a string _id
    if (!this._id) {
      this._id = crypto.randomBytes(12).toString('hex');
    }

    // Keep reference to model for saving/deleting
    Object.defineProperty(this, '_model', {
      value: model,
      enumerable: false,
      writable: true
    });
  }

  async save() {
    return this._model.saveDoc(this);
  }
}

class MockQuery {
  constructor(execFn) {
    this.execFn = execFn;
    this.sortCriteria = null;
    this.limitValue = null;
    this.populateFields = [];
  }

  sort(criteria) {
    this.sortCriteria = criteria;
    return this;
  }

  limit(number) {
    this.limitValue = number;
    return this;
  }

  populate(field) {
    if (field) {
      this.populateFields.push(field);
    }
    return this;
  }

  // Make query object thenable so it acts like a Promise (allowing await)
  async then(onFulfilled, onRejected) {
    try {
      const result = await this.execFn(this);
      return onFulfilled ? onFulfilled(result) : result;
    } catch (err) {
      if (onRejected) return onRejected(err);
      throw err;
    }
  }
}

class MockModel {
  constructor(name, schema) {
    this.name = name;
    this.schema = schema;
    this.filePath = path.join(__dirname, 'data', `${name.toLowerCase()}s.json`);

    // Ensure data directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  _read() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(content || '[]');
    } catch (err) {
      console.error(`❌ Error reading database file ${this.filePath}:`, err);
      return [];
    }
  }

  _write(data) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error(`❌ Error writing database file ${this.filePath}:`, err);
    }
  }

  async saveDoc(doc) {
    const data = this._read();
    
    // Convert doc back to raw JSON
    const cleanDoc = { ...doc };
    
    // Set Timestamps
    const now = new Date().toISOString();
    cleanDoc.updatedAt = now;
    if (!cleanDoc.createdAt) {
      cleanDoc.createdAt = now;
    }

    const index = data.findIndex(d => d._id === cleanDoc._id);
    if (index >= 0) {
      data[index] = cleanDoc;
    } else {
      data.push(cleanDoc);
    }
    
    this._write(data);
    return new MockDocument(cleanDoc, this);
  }

  find(query = {}) {
    return new MockQuery(async (q) => {
      let data = this._read();

      // Basic filtering
      data = data.filter(item => {
        for (const key in query) {
          if (query[key] !== undefined) {
            const queryVal = query[key];
            const itemVal = item[key];
            
            // Handle matching nested ObjectId references or objects
            if (queryVal && typeof queryVal === 'object' && queryVal._id) {
              if (itemVal !== queryVal._id.toString()) return false;
            } else if (queryVal && queryVal.toString) {
              if (!itemVal || itemVal.toString() !== queryVal.toString()) return false;
            } else {
              if (itemVal !== queryVal) return false;
            }
          }
        }
        return true;
      });

      // Apply sorting
      if (q.sortCriteria) {
        data.sort((a, b) => {
          for (const key in q.sortCriteria) {
            const direction = q.sortCriteria[key];
            const valA = a[key];
            const valB = b[key];
            if (valA < valB) return direction === -1 ? 1 : -1;
            if (valA > valB) return direction === -1 ? -1 : 1;
          }
          return 0;
        });
      }

      // Apply limit
      if (q.limitValue !== null) {
        data = data.slice(0, q.limitValue);
      }

      // Wrap in MockDocument
      let docs = data.map(item => new MockDocument(item, this));

      // Apply population
      if (q.populateFields.length > 0) {
        for (const field of q.populateFields) {
          for (const doc of docs) {
            const idVal = doc[field];
            if (idVal) {
              // Infer the target model
              let targetModelName = null;
              if (field === 'diagnosisId') {
                targetModelName = 'Diagnosis';
              } else if (field === 'userId') {
                targetModelName = 'User';
              } else if (field === 'sessionId') {
                targetModelName = 'ChatSession';
              }

              if (targetModelName && modelRegistry[targetModelName]) {
                const populatedDoc = await modelRegistry[targetModelName].findById(idVal);
                doc[field] = populatedDoc || null;
              }
            }
          }
        }
      }

      return docs;
    });
  }

  async countDocuments(query = {}) {
    const data = this._read();
    return data.length;
  }

  findOne(query = {}) {
    return new MockQuery(async (q) => {
      const results = await this.find(query).sort(q.sortCriteria).populate(q.populateFields);
      return results[0] || null;
    });
  }

  findById(id) {
    return new MockQuery(async (q) => {
      if (!id) return null;
      const idStr = id._id ? id._id.toString() : id.toString();
      const results = await this.find({ _id: idStr }).populate(q.populateFields);
      return results[0] || null;
    });
  }

  async create(docData) {
    // Merge schema defaults if any
    const defaultData = {};
    if (this.schema && this.schema.definition) {
      for (const key in this.schema.definition) {
        const prop = this.schema.definition[key];
        if (prop && prop.default !== undefined) {
          defaultData[key] = typeof prop.default === 'function' ? prop.default() : prop.default;
        }
      }
    }

    const newDoc = new MockDocument({
      ...defaultData,
      ...docData,
      _id: crypto.randomBytes(12).toString('hex'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, this);

    return this.saveDoc(newDoc);
  }

  async findOneAndUpdate(query, update, options = {}) {
    const data = this._read();
    
    // Find index
    const index = data.findIndex(item => {
      for (const key in query) {
        if (query[key] !== undefined) {
          const queryVal = query[key];
          const itemVal = item[key];
          if (queryVal && queryVal.toString) {
            if (!itemVal || itemVal.toString() !== queryVal.toString()) return false;
          } else {
            if (itemVal !== queryVal) return false;
          }
        }
      }
      return true;
    });

    let docData;
    if (index >= 0) {
      // Apply update (Mongoose supports $set or direct update properties)
      const existing = data[index];
      const actualUpdate = update.$set || update;
      docData = { ...existing, ...actualUpdate, updatedAt: new Date().toISOString() };
      data[index] = docData;
      this._write(data);
    } else if (options.upsert) {
      // Upsert
      const actualUpdate = update.$set || update;
      docData = {
        ...query,
        ...actualUpdate,
        _id: crypto.randomBytes(12).toString('hex'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.push(docData);
      this._write(data);
    } else {
      return null;
    }

    return new MockDocument(docData, this);
  }

  async findByIdAndUpdate(id, update, options = {}) {
    if (!id) return null;
    const idStr = id._id ? id._id.toString() : id.toString();
    return this.findOneAndUpdate({ _id: idStr }, update, options);
  }

  async findByIdAndDelete(id) {
    if (!id) return null;
    const idStr = id._id ? id._id.toString() : id.toString();
    const data = this._read();
    const index = data.findIndex(item => item._id === idStr);
    if (index >= 0) {
      const deleted = data.splice(index, 1)[0];
      this._write(data);
      return new MockDocument(deleted, this);
    }
    return null;
  }

  async countDocuments(query = {}) {
    const results = await this.find(query);
    return results.length;
  }
}

// Global mongoose object export matching original Mongoose API
const mockMongoose = {
  Schema: class Schema {
    constructor(definition, options) {
      this.definition = definition;
      this.options = options;
    }
  },
  model(name, schema) {
    if (!modelRegistry[name]) {
      modelRegistry[name] = new MockModel(name, schema);
    }
    return modelRegistry[name];
  },
  connect: async (uri) => {
    console.log(`\n💾 [Mock DB] Bypassing MongoDB server. Using local JSON files database at ./data/`);
    return true;
  },
  connection: {
    readyState: 1 // 1 means connected
  }
};

// Define Mongoose Schema Types
mockMongoose.Schema.Types = {
  ObjectId: String,
  Mixed: Object
};

module.exports = mockMongoose;
