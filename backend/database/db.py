# Real database module using pymongo for MongoDB connectivity
import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load .env from the backend directory
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
load_dotenv(env_path)

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/smart-park')

def get_db():
    client = MongoClient(MONGO_URI)
    # Extract DB name from URI or use default
    db_name = MONGO_URI.split('/')[-1].split('?')[0] or 'smart-park'
    return client[db_name]

# Singleton-style accessor for cleaner imports
db = get_db()
