import sys
import asyncio
import questionary
from bson.objectid import ObjectId
from auth.login import login
from auth.signup import sign_up
from auth.session import create_session, validate_session, is_local_session_expired, clear_local_session, load_local_session, invalidate_session
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


class CLIAuth:

    @staticmethod
    async def _validate_input(field_name: str, password: bool = False) -> str:
        while True:
            if password:
                ans = await questionary.password(f"Enter your {field_name}: ").ask_async()
            else:
                ans = await questionary.text(f"Enter your {field_name}: ").ask_async()

            if ans is None:
                print(f"\n{field_name} input cancelled by user.")
                sys.exit(0)

            ans = ans.strip()
            if not ans:
                print(f"{field_name} cannot be empty. Please try again.")
            else:
                return ans

    @staticmethod
    async def _scram_operations() -> dict | str | None:
        while True:
            choice = await questionary.select(
                "Please authenticate to continue: ",
                choices=["Login", "Sign up", "Exit"],
            ).ask_async()

            if choice == "Login":
                username = await CLIAuth._validate_input("username")
                password = await CLIAuth._validate_input("password", password=True)

                result = await login(username, password)

                if not result:
                    print("Authentication failed. Please try again.")
                    return None

                print("Authentication successfully")
                user_id = result["user_id"] 
                username = result["username"]
                session_result = await create_session(user_id, username)

                # check session creation status
                if session_result:
                    print("Session created successfully.")
                else:
                    print("Failed to create session. Please try again.")

                return result

            elif choice == "Sign up":
                username = await CLIAuth._validate_input("username")
                password = await CLIAuth._validate_input("password", password=True)
                name = await CLIAuth._validate_input("name")
                email = await CLIAuth._validate_input("email")

                result = await sign_up(username, password, name, email)

                if not result:
                    print("Sign up failed. Please try again.")
                    return None
                
                print("Sign up successful. You can now log in.")

                session_result = await create_session(result["user_id"], result["username"])
                
                # check session creation status
                if session_result:
                    print("Session created successfully.")
                else:
                    print("Failed to create session. Please try logging in.")
                
                return result

            elif choice == "Exit" or choice is None:
                return "<exit_signal>"

    @staticmethod
    async def authenticate() -> dict | str | None:
        try:
            session = load_local_session()

            if session and not is_local_session_expired(session):
                print("Existing session found. Validating...")
                token = session["token"]
                user_id = session["user_id"]
                username = session["username"]
                valid_session = await validate_session(token, user_id)

                if valid_session:
                    return {"user_id": ObjectId(user_id), "username": username}

                print("Session validation failed. Please log in again.")
                clear_local_session()

            # no valid session — go through auth flow
            scram_result = await CLIAuth._scram_operations()
            if scram_result == "<exit_signal>":
                print("Exiting...")
                sys.exit(0)

            return scram_result

        except (KeyboardInterrupt, asyncio.CancelledError):
            print("\nOperation cancelled by user.")
            sys.exit(0)
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            sys.exit(1)

    @staticmethod
    async def signout():
        session = load_local_session()
        if not session:
            print("No active session found.")
            return

        await invalidate_session(session["token"])
        print("Signed out successfully.")