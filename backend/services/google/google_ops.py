from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google_auth_httplib2 import AuthorizedHttp
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
import httplib2
import io
import os
from dotenv import load_dotenv

load_dotenv()

FOLDER_MIME = "application/vnd.google-apps.folder"
MAX_GROUP_FOLDERS = 100  # shortcut: a huge Drive tree is only partly grouped (rest skipped, logged), raise when real folders need it
MAX_GROUP_DEPTH = 5

class GoogleDriveService:
    def __init__(self, service):
        self.service = service
        
    def download_files_bytes(self, file_id):
        request = self.service.files().get_media(
            fileId=file_id, 
            supportsAllDrives=True
        )
        # The shared service object wraps a single httplib2.Http, which is NOT thread-safe:
        # concurrent downloads (e.g. a grid of thumbnails) collide on the one socket and raise
        # SSL WRONG_VERSION_NUMBER / read timeouts. Give each download its own transport.
        request.http = AuthorizedHttp(self.service._http.credentials, http=httplib2.Http())

        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        
        done = False
        while not done:
            _, done = downloader.next_chunk()
            
        return buffer.getvalue()

    def get_folder_content_by_id_with_pagination(self, folder_id):
        query = f"'{folder_id}' in parents and trashed = false"
        files = []
        page_token = None
        
        while True:
            response = self.service.files().list(
                q=query,
                spaces="drive",
                fields="nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, thumbnailLink, md5Checksum)",
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                orderBy="modifiedTime desc",
            ).execute()
            
            files.extend(response.get("files", []))
            page_token = response.get("nextPageToken", None)
            
            if not page_token:
                break
            
        return files

    def get_folder_tree_with_groups(self, folder_id):
        """Files of the folder plus the files inside its sub-folders. A file inside a top-level sub-folder (at any
        depth) gets `groupName` = that top-level folder's name; files directly in the folder have no `groupName`."""
        root = self.get_folder_content_by_id_with_pagination(folder_id)
        files = [f for f in root if f.get("mimeType") != FOLDER_MIME]
        queue = [(f["id"], f.get("name", ""), 1) for f in root if f.get("mimeType") == FOLDER_MIME]
        seen = 0
        while queue:
            sub_id, group, depth = queue.pop(0)
            seen += 1
            if seen > MAX_GROUP_FOLDERS:
                print(f"Drive folder tree has more than {MAX_GROUP_FOLDERS} sub-folders; the rest were not grouped.")
                break
            for f in self.get_folder_content_by_id_with_pagination(sub_id):
                if f.get("mimeType") == FOLDER_MIME:
                    if depth < MAX_GROUP_DEPTH:
                        queue.append((f["id"], group, depth + 1))
                else:
                    files.append({**f, "groupName": group})
        return files

    def get_folder_content_by_path(self, folder_path: str):
        parts = [p.replace("'", "\\") for p in folder_path.strip("/").split("/") if p]
        if not parts:
            raise ValueError("Invalid folder path provided.")

        parent_id = None # allows chyecking root or top-level shared items

        for i, name in enumerate(parts):
            is_last = (i == len(parts) - 1)

            query_parts = [
                f"name = '{name}'",
                "trashed = false"
            ]

            if parent_id:
                query_parts.append(f"'{parent_id}' in parents")
                
            if not is_last:
                query_parts.append("mimeType = 'application/vnd.google-apps.folder'")
                
            query = " and ".join(query_parts)
            
            response = self.service.files().list(
                q=query,
                spaces="drive",
                fields="files(id, name, mimeType)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()
            
            files = response.get("files", [])
            if not files:
                raise FileNotFoundError(f"File or folder '{name}' not found in the specified path.")
            
            parent_id = files[0]["id"]
                
        folder_metadata = files[0]
        
        if folder_metadata["mimeType"] != "application/vnd.google-apps.folder":
            raise ValueError(f"The path '{folder_path}' does not point to a folder.")
        
        folder_id = folder_metadata["id"]
        
        return self.get_folder_content_by_id_with_pagination(folder_id)


if __name__ == "__main__":
    import asyncio
    from services.google import drive_tokens
    from services.mongodb.mongodb_connect import connect_to_mongodb
    
    id = None
    
    async def main():
        # dev check: uses user "1"'s stored Drive connection
        drive_service_instance = drive_tokens.service_for_user(connect_to_mongodb()[1], "1")
        
        async def print_file_metadata(folder_id):
            # Example usage: Get metadata by folder ID
            metadata_by_id = drive_service_instance.get_folder_content_by_id_with_pagination(folder_id)
            # print("Metadata by ID:", metadata_by_id)
            print("Test fetching google drive by id")
            print(f"Total count: {len(metadata_by_id)}")
            for file in metadata_by_id:
                print(f"File Name: {file['name']}, File ID: {file['id']}, MIME Type: {file['mimeType']}, Modified Time: {file.get('modifiedTime', 'N/A')}")

        async def print_file_metadata_by_path(folder_path):
            # Example usage: Get metadata by folder path
            metadata_by_path = drive_service_instance.get_folder_content_by_path(folder_path)
            # print("Metadata by Path:", metadata_by_path)
            print("\n\nTest fetching google drive by path")
            print(f"Total count: {len(metadata_by_path)}")
            for file in metadata_by_path:
                print(f"File Name: {file['name']}, File ID: {file['id']}, MIME Type: {file['mimeType']}, Modified Time: {file.get('modifiedTime', 'N/A')}")
                
        await print_file_metadata("1AUK8pAGYQgLPyI1DkFV5lzilskcRzJ4_")  # Replace with a valid folder ID
        
        

    asyncio.run(main())
